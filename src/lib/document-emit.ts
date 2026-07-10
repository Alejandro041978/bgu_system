import { createClient } from '@supabase/supabase-js'
import { emitCertificate } from './simplecert'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface EmitDocResult { ok: boolean; url?: string; error?: string }

// Emite el PDF de una solicitud a través de SimpleCert y actualiza la solicitud
// a 'delivered' con la URL del documento. Valida pago si el documento tiene costo.
export async function emitDocument(requestId: string): Promise<EmitDocResult> {
  const sb = admin()

  const { data: r } = await sb.from('document_requests')
    .select('id, status, paid, field_values, program_id, student:academic_students(first_name, last_name, second_last_name, document_number, email), type:document_types(name, price, simplecert_project_id, field_map)')
    .eq('id', requestId).maybeSingle()
  if (!r) return { ok: false, error: 'Solicitud no encontrada' }
  if (r.status === 'delivered') return { ok: false, error: 'La solicitud ya fue emitida' }
  if (r.status === 'rejected') return { ok: false, error: 'La solicitud está rechazada' }

  const type = r.type
  if (!type?.simplecert_project_id) return { ok: false, error: 'El tipo de documento no tiene SimpleCert Project ID configurado' }
  if (Number(type.price) > 0 && !r.paid) return { ok: false, error: 'La solicitud tiene un cargo pendiente de pago' }

  // Programa, categoría y total de créditos (consultas explícitas, sin depender de FK para embed).
  let programName = ''
  let categoryName = ''
  let creditsTotal = ''
  let hoursTotal = ''
  if (r.program_id) {
    const { data: prog } = await sb.from('academic_programs').select('name, category_id').eq('id', r.program_id).maybeSingle()
    programName = prog?.name ?? ''
    if (prog?.category_id) {
      const { data: cat } = await sb.from('academic_programs_category').select('name').eq('id', prog.category_id).maybeSingle()
      categoryName = cat?.name ?? ''
    }
    const { data: courses } = await sb.from('academic_courses').select('credits, hours').eq('program_id', r.program_id)
    const sum = (courses ?? []).reduce((a: number, c: { credits: number | null }) => a + Number(c.credits ?? 0), 0)
    creditsTotal = sum ? String(sum) : ''
    const sumH = (courses ?? []).reduce((a: number, c: { hours: number | null }) => a + Number(c.hours ?? 0), 0)
    hoursTotal = sumH ? String(sumH) : ''
  }

  const s = r.student ?? {}
  const now = new Date()
  const dateShort = now.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const dateLong = now.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
  const dateLongEn = now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
  const requestCode = String(r.id).slice(0, 8).toUpperCase()

  // Diccionario de datos disponibles del ERP, por clave de "source".
  const sources: Record<string, string> = {
    first_name: s.first_name ?? '',
    last_name_p: s.last_name ?? '',
    last_name_m: s.second_last_name ?? '',
    last_name: [s.last_name, s.second_last_name].filter(Boolean).join(' '),
    full_name: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '),
    email: s.email ?? '',
    document_number: s.document_number ?? '',
    program: programName,
    category: categoryName,
    credits_total: creditsTotal,
    hours_total: hoursTotal,
    date_short: dateShort,
    date_long: dateLong,
    date_long_en: dateLongEn,
    request_code: requestCode,
  }

  const fields: Record<string, string | null | undefined> = {}
  const fieldMap = Array.isArray(r.type?.field_map) ? r.type.field_map : []
  if (fieldMap.length) {
    // Mapeo configurado por tipo de documento: merge tag → dato del ERP (o texto fijo).
    for (const m of fieldMap as { tag: string; source: string; value?: string }[]) {
      if (!m?.tag) continue
      fields[m.tag] = m.source === 'literal' ? (m.value ?? '') : (sources[m.source] ?? '')
    }
  } else {
    // Sin mapeo: set genérico por compatibilidad.
    fields.DOCUMENT_NUMBER = sources.document_number
    fields.PROGRAM = programName
    fields.CATEGORY = categoryName
    fields.ISSUE_DATE = dateShort
    fields.ISSUE_DATE_LONG = dateLong
    fields.REQUEST_CODE = requestCode
  }
  // Campos capturados en etapas humanas (clave y su versión en MAYÚSCULAS = merge tag).
  for (const [k, v] of Object.entries(r.field_values ?? {})) { fields[k] = v as string; fields[k.toUpperCase()] = v as string }

  const res = await emitCertificate({
    projectId: type.simplecert_project_id,
    firstName: s.first_name ?? '',
    lastName: [s.last_name, s.second_last_name].filter(Boolean).join(' '),
    email: s.email ?? '',
    fields,
  })
  if (!res.ok) return { ok: false, error: res.error }

  const { error } = await sb.from('document_requests').update({
    document_url: res.certificateUrl, status: 'delivered', emitted_at: now.toISOString(), updated_at: now.toISOString(),
  }).eq('id', requestId)
  if (error) return { ok: false, error: error.message }

  return { ok: true, url: res.certificateUrl }
}
