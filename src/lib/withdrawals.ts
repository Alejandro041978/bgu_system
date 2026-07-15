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

// Siguiente número de resolución para un estudiante y tipo de retiro.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextResolutionNumber(sb: any, studentId: string, type: 'IW' | 'LOA', date: string): Promise<string | null> {
  const token = await tokenForStudent(sb, studentId)
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

  // Egresados detectados (tolerante a que la tabla no exista todavía)
  const grads = await readAll(sb, 'student_graduations', 'student_id').catch(() => [])
  const isGraduate = new Set<string>((grads as { student_id: string }[]).map(g => g.student_id))

  // Campus socio: todas las matrículas en programas de socio
  const partner = await readAll(sb, 'academic_programs', 'id, partner_campus')
  const partnerIds = new Set<string>((partner as { id: string; partner_campus: boolean }[]).filter(p => p.partner_campus).map(p => p.id))
  const enrolls = await readAll(sb, 'academic_student_enrollments', 'student_id, program_id')
  const total = new Map<string, number>(), inPartner = new Map<string, number>()
  for (const e of enrolls as { student_id: string | null; program_id: string | null }[]) {
    if (!e.student_id) continue
    total.set(e.student_id, (total.get(e.student_id) ?? 0) + 1)
    if (e.program_id && partnerIds.has(e.program_id)) inPartner.set(e.student_id, (inPartner.get(e.student_id) ?? 0) + 1)
  }

  const studs = await readAll(sb, 'academic_students', 'id, situation, situation_source')
  const counts = { activo: 0, retiro_permanente: 0, retiro_temporal: 0, egresado: 0, campus_socio: 0, updated: 0 }
  const changes: { id: string; situation: string }[] = []
  for (const s of studs as { id: string; situation: string; situation_source: string }[]) {
    let want: string
    if (hasIW.has(s.id)) want = 'retiro_permanente'
    else if (hasLOA.has(s.id)) want = 'retiro_temporal'
    else if (isGraduate.has(s.id)) want = 'egresado'
    else if ((total.get(s.id) ?? 0) > 0 && (inPartner.get(s.id) ?? 0) >= (total.get(s.id) ?? 0)) want = 'campus_socio'
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
