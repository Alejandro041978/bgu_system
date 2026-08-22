import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const wdb = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readAll(sb: any, table: string, cols: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from(table).select(cols).range(from, from + 999)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Número de resolución: NNN-2025/2026-IW-BACHELOR
//   El consecutivo corre por separado para cada combinación tipo + token + año.
//   Los tokens se verificaron cruzando los 285 IW importados contra la
//   categoría real de cada estudiante (mapeo 1:1, sin cruces):
//     BACHELOR=Bachelor Program · MASTER=Master Program ·
//     DOCTORATE=Doctoral Program · DCE=Division of Continuing Education
// ---------------------------------------------------------------------------
export function tokenForCategory(categoryName: string | null | undefined): string | null {
  const n = (categoryName ?? '').trim().toLowerCase()
  if (!n) return null
  if (n.startsWith('division of continuing education')) return 'DCE'
  if (n.startsWith('bachelor')) return 'BACHELOR'
  if (n.startsWith('master')) return 'MASTER'
  if (n.startsWith('doctoral')) return 'DOCTORATE'
  return null
}

export function parseResolution(r: string | null | undefined): { seq: number; year: string; type: string; token: string } | null {
  const m = (r ?? '').toUpperCase().match(/(\d+)\s*-\s*(\d{4}\/\d{4})\s*-\s*(IW|LOA)\s*-\s*([A-Z]+)/)
  if (!m) return null
  return { seq: parseInt(m[1], 10), year: m[2], type: m[3], token: m[4] }
}

// Etiqueta del año académico que contiene la fecha ("2025/2026").
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function academicYearLabel(sb: any, date: string): Promise<string> {
  const { data } = await sb.from('academic_years').select('start_date, end_date')
  for (const y of (data ?? []) as { start_date: string; end_date: string }[]) {
    if (y.start_date <= date && date <= y.end_date) {
      return `${new Date(y.start_date).getUTCFullYear()}/${new Date(y.end_date).getUTCFullYear()}`
    }
  }
  // Sin año académico definido: se asume que arranca en septiembre.
  const d = new Date(date)
  const y = d.getUTCFullYear()
  return d.getUTCMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

// Token del estudiante según la categoría de sus programas matriculados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tokenForStudent(sb: any, studentId: string): Promise<string | null> {
  const { data: enr } = await sb.from('academic_student_enrollments').select('program_id').eq('student_id', studentId)
  const progIds = (enr ?? []).map((e: { program_id: string | null }) => e.program_id).filter(Boolean)
  if (!progIds.length) return null
  const { data: progs } = await sb.from('academic_programs')
    .select('id, category:academic_programs_category(name)').in('id', progIds)
  for (const p of (progs ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tokenForCategory((p as any).category?.name)
    if (t) return t
  }
  return null
}

// ---------------------------------------------------------------------------
// La matrícula a la que pertenece un retiro (regla del usuario, 22/08/2026: el
// retiro es de la matrícula, no del estudiante). Con una sola matrícula se
// asume; con varias hay que elegir, y si no se eligió se devuelven las
// opciones para que la pantalla pregunte.
// ---------------------------------------------------------------------------
export interface OpcionMatricula { id: string; program_id: string; program: string; enrollment_date: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function matriculaDelRetiro(sb: any, studentId: string, enrollmentId?: string | null):
  Promise<{ ok: true; enrollment: OpcionMatricula } | { ok: false; error: string; opciones: OpcionMatricula[] }> {
  const { data } = await sb.from('academic_student_enrollments')
    .select('id, program_id, enrollment_date, program:academic_programs(name)')
    .eq('student_id', studentId).order('enrollment_date', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opciones: OpcionMatricula[] = ((data ?? []) as any[]).map(e => ({
    id: String(e.id), program_id: String(e.program_id ?? ''), program: e.program?.name ?? '(sin programa)',
    enrollment_date: e.enrollment_date ? String(e.enrollment_date).slice(0, 10) : null,
  }))
  if (!opciones.length) return { ok: false, error: 'El estudiante no tiene ninguna matrícula: no hay de qué retirarlo.', opciones }
  if (enrollmentId) {
    const e = opciones.find(o => o.id === String(enrollmentId))
    return e ? { ok: true, enrollment: e } : { ok: false, error: 'La matrícula indicada no es de este estudiante.', opciones }
  }
  if (opciones.length === 1) return { ok: true, enrollment: opciones[0] }
  return { ok: false, error: 'El estudiante tiene varias matrículas: indica de cuál se retira (enrollment_id).', opciones }
}

// Token de categoría de UNA matrícula (el número de resolución lleva la
// familia: …-IW-BACHELOR, …-IW-DCE).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tokenForEnrollment(sb: any, enrollmentId: string): Promise<string | null> {
  const { data } = await sb.from('academic_student_enrollments')
    .select('program:academic_programs(category:academic_programs_category(name))').eq('id', enrollmentId).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tokenForCategory((data as any)?.program?.category?.name)
}

// Siguiente número de resolución para un estudiante y tipo de retiro. Con la
// matrícula, la familia sale de SU programa (un alumno de Bachelor y DCE no
// puede recibir un …-IW-BACHELOR por su diplomado).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextResolutionNumber(sb: any, studentId: string, type: 'IW' | 'LOA', date: string, enrollmentId?: string | null): Promise<string | null> {
  const token = (enrollmentId ? await tokenForEnrollment(sb, enrollmentId) : null) ?? await tokenForStudent(sb, studentId)
  if (!token) return null
  const year = await academicYearLabel(sb, date)
  const { data } = await sb.from('student_withdrawals').select('resolution_number').not('resolution_number', 'is', null)
  let max = 0
  for (const w of (data ?? []) as { resolution_number: string }[]) {
    const p = parseResolution(w.resolution_number)
    if (p && p.type === type && p.token === token && p.year === year) max = Math.max(max, p.seq)
  }
  return `${String(max + 1).padStart(3, '0')}-${year}-${type}-${token}`
}

// ---------------------------------------------------------------------------
// Situación derivada. Prioridad:
//   etiqueta manual > IW vigente > LOA vigente > egresado > campus socio > activo
// Egresado va por encima de campus socio porque es más informativo: quien
// terminó su malla entra al embudo de titulación, no al de retención.
// Nunca pisa situation_source='manual'.
//
// Egresado exige haber terminado TODOS los programas matriculados, no alguno:
// cada matrícula es un proceso independiente, y quien se tituló de su maestría
// y hoy cursa el doctorado es un estudiante activo — si se le marca egresado,
// Camila deja de verlo aunque abandone el doctorado.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recomputeSituations(sb: any): Promise<{ activo: number; retiro_permanente: number; retiro_temporal: number; egresado: number; campus_socio: number; updated: number }> {
  // Retiros vigentes
  const wds = await readAll(sb, 'student_withdrawals', 'student_id, type, status')
  const hasIW = new Set<string>(), hasLOA = new Set<string>()
  for (const w of wds as { student_id: string; type: string; status: string }[]) {
    if (w.status !== 'vigente') continue
    if (w.type === 'IW') hasIW.add(w.student_id)
    else if (w.type === 'LOA') hasLOA.add(w.student_id)
  }

  // Egresos por (estudiante, programa) — tolerante a que la tabla no exista todavía
  const grads = await readAll(sb, 'student_graduations', 'student_id, program_id').catch(() => [])
  const gradPairs = new Set<string>(
    (grads as { student_id: string; program_id: string }[]).map(g => `${g.student_id}|${g.program_id}`))

  // Programas de cada estudiante (para egresado y campus socio: AMBOS exigen
  // que la condición se cumpla en todas sus matrículas)
  const partner = await readAll(sb, 'academic_programs', 'id, partner_campus')
  const partnerIds = new Set<string>((partner as { id: string; partner_campus: boolean }[]).filter(p => p.partner_campus).map(p => p.id))
  const enrolls = await readAll(sb, 'academic_student_enrollments', 'student_id, program_id')
  const progsOf = new Map<string, Set<string>>()
  for (const e of enrolls as { student_id: string | null; program_id: string | null }[]) {
    if (!e.student_id || !e.program_id) continue
    if (!progsOf.has(e.student_id)) progsOf.set(e.student_id, new Set())
    progsOf.get(e.student_id)!.add(e.program_id)
  }

  const studs = await readAll(sb, 'academic_students', 'id, situation, situation_source')
  const counts = { activo: 0, retiro_permanente: 0, retiro_temporal: 0, egresado: 0, campus_socio: 0, updated: 0 }
  const changes: { id: string; situation: string }[] = []
  for (const s of studs as { id: string; situation: string; situation_source: string }[]) {
    const programas = [...(progsOf.get(s.id) ?? [])]
    let want: string
    if (hasIW.has(s.id)) want = 'retiro_permanente'
    else if (hasLOA.has(s.id)) want = 'retiro_temporal'
    else if (programas.length > 0 && programas.every(p => gradPairs.has(`${s.id}|${p}`))) want = 'egresado'
    else if (programas.length > 0 && programas.every(p => partnerIds.has(p))) want = 'campus_socio'
    else want = 'activo'
    counts[want as keyof typeof counts]++
    if (s.situation_source !== 'manual' && s.situation !== want) changes.push({ id: s.id, situation: want })
  }

  for (let i = 0; i < changes.length; i += 50) {
    const chunk = changes.slice(i, i + 50)
    await Promise.all(chunk.map(c => sb.from('academic_students')
      .update({ situation: c.situation, situation_source: 'auto' }).eq('id', c.id).eq('situation_source', 'auto')))
    counts.updated += chunk.length
  }
  return counts
}
