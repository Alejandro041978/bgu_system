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
    .select('id, status, paid, field_values, program_id, student:academic_students(first_name, last_name, second_last_name, document_number, email), type:document_types(name, price, simplecert_project_id)')
    .eq('id', requestId).maybeSingle()
  if (!r) return { ok: false, error: 'Solicitud no encontrada' }
  if (r.status === 'delivered') return { ok: false, error: 'La solicitud ya fue emitida' }
  if (r.status === 'rejected') return { ok: false, error: 'La solicitud está rechazada' }

  const type = r.type
  if (!type?.simplecert_project_id) return { ok: false, error: 'El tipo de documento no tiene SimpleCert Project ID configurado' }
  if (Number(type.price) > 0 && !r.paid) return { ok: false, error: 'La solicitud tiene un cargo pendiente de pago' }

  // Programa y categoría (consultas explícitas, sin depender de FK para embed).
  let programName = ''
  let categoryName = ''
  if (r.program_id) {
    const { data: prog } = await sb.from('academic_programs').select('name, category_id').eq('id', r.program_id).maybeSingle()
    programName = prog?.name ?? ''
    if (prog?.category_id) {
      const { data: cat } = await sb.from('academic_programs_category').select('name').eq('id', prog.category_id).maybeSingle()
      categoryName = cat?.name ?? ''
    }
  }

  const s = r.student ?? {}
  const now = new Date()
  const fields: Record<string, string | null | undefined> = {
    DOCUMENT_NUMBER: s.document_number,
    PROGRAM: programName,
    CATEGORY: categoryName,
    ISSUE_DATE: now.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    ISSUE_DATE_LONG: now.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }),
    REQUEST_CODE: String(r.id).slice(0, 8).toUpperCase(),
  }
  // Campos capturados en las etapas humanas (clave del campo = merge tag).
  for (const [k, v] of Object.entries(r.field_values ?? {})) fields[k] = v as string

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
