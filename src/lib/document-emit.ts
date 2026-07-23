import { createClient } from '@supabase/supabase-js'
import { emitCertificate } from './simplecert'
import { marcarTitulado } from './titulacion'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface EmitDocResult { ok: boolean; url?: string; error?: string }

// Emite el PDF de una solicitud a través de SimpleCert y actualiza la solicitud
// a 'delivered' con la URL del documento. Valida pago si el documento tiene costo.
export async function emitDocument(requestId: string): Promise<EmitDocResult> {
  const sb = admin()

  const { data: r } = await sb.from('document_requests')
    .select('id, status, paid, field_values, program_id, student_id, document_type_id, student:academic_students(first_name, last_name, second_last_name, document_number, email, email_alt), type:document_types(name, price, simplecert_project_id, field_map)')
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

  // Fecha de CULMINACIÓN del programa (cuando aprobó toda su malla) — NO es la
  // fecha de emisión ni la de titulación. Vive en student_graduations.
  let compShort = '', compLong = '', compLongEn = ''
  if (r.program_id && r.student_id) {
    try {
      const { data: grad } = await sb.from('student_graduations')
        .select('completed_at').eq('student_id', r.student_id).eq('program_id', r.program_id).maybeSingle()
      if (grad?.completed_at) {
        const d = new Date(String(grad.completed_at).slice(0, 10) + 'T12:00:00')
        compShort = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        compLong = d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
        compLongEn = d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
      }
    } catch { /* columna aún sin migrar: los tags salen vacíos */ }
  }

  // Correo del estudiante: el INSTITUCIONAL (@blackwell.pro, email_alt) cuando
  // existe — misma regla que las cuentas Moodle. El personal solo como respaldo
  // (DCE y quien aún no tiene el suyo).
  const studentEmail = s.email_alt || s.email || ''

  // Año académico de la MATRÍCULA en el programa (la primera, si hubo varias):
  // term_year de la matrícula, o el año de la fecha de matrícula como respaldo.
  let academicYear = ''
  if (r.program_id && r.student_id) {
    const { data: enr } = await sb.from('academic_student_enrollments')
      .select('term_year, enrollment_date').eq('student_id', r.student_id).eq('program_id', r.program_id)
      .order('enrollment_date', { ascending: true }).limit(1).maybeSingle()
    if (enr?.term_year) academicYear = String(enr.term_year)
    else if (enr?.enrollment_date) academicYear = String(enr.enrollment_date).slice(0, 4)
  }

  // Diccionario de datos disponibles del ERP, por clave de "source".
  const sources: Record<string, string> = {
    first_name: s.first_name ?? '',
    last_name_p: s.last_name ?? '',
    last_name_m: s.second_last_name ?? '',
    last_name: [s.last_name, s.second_last_name].filter(Boolean).join(' '),
    full_name: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '),
    email: studentEmail,
    document_number: s.document_number ?? '',
    program: programName,
    category: categoryName,
    credits_total: creditsTotal,
    hours_total: hoursTotal,
    date_short: dateShort,
    date_long: dateLong,
    date_long_en: dateLongEn,
    completion_date: compShort,
    completion_date_long: compLong,
    completion_date_long_en: compLongEn,
    academic_year: academicYear,
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
    email: studentEmail,
    fields,
  })
  if (!res.ok) return { ok: false, error: res.error }

  const { error } = await sb.from('document_requests').update({
    document_url: res.certificateUrl, status: 'delivered', emitted_at: now.toISOString(), updated_at: now.toISOString(),
  }).eq('id', requestId)
  if (error) return { ok: false, error: error.message }

  // Si el documento emitido ES el título final (Degree, Certificate DCE), el
  // egresado pasa a titulado en ese programa. Emitir el título es el acto que
  // lo confiere; la entrega física se registra aparte, como hito logístico.
  // No se interrumpe la emisión si esto falla: el documento ya salió.
  try {
    const { data: t } = await sb.from('document_types')
      .select('is_final_degree').eq('id', r.document_type_id).maybeSingle()
    if (t?.is_final_degree) {
      const studentId = (r as { student_id?: string }).student_id
      if (studentId) await marcarTitulado(studentId, r.program_id ?? null, { source: 'emision' })
    }
  } catch (e) {
    console.error('marcarTitulado tras emitir', e)
  }

  return { ok: true, url: res.certificateUrl }
}
