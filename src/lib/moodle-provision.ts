import { createClient } from '@supabase/supabase-js'
import { getUserByEmail, getUserByIdnumber, getCourseByCode, enrolUser, unenrolUser, moodleConfigured } from './moodle'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface SyncResult {
  configured: boolean
  students_total: number
  with_account: number
  no_account: number
  enrol_ops: number
  courses_unmapped: string[]
  errors: string[]
}

// La cuenta Moodle se resuelve primero por external_id (= idnumber en Moodle,
// el Users.Id de SystemActiva: llave fiable, 550/550 en las aulas reales) y
// como respaldo por correo (casi nunca coincide: Moodle usa el institucional).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureMoodleUser(sb: any, s: { id: string; email: string | null; moodle_user_id: string | null; external_id?: string | null }): Promise<number | null> {
  if (s.moodle_user_id) return Number(s.moodle_user_id)
  let u: { id: number } | null = null
  if (s.external_id) u = await getUserByIdnumber(s.external_id)
  if (!u && s.email) u = await getUserByEmail(s.email)
  if (!u) return null
  await sb.from('academic_students').update({ moodle_user_id: String(u.id) }).eq('id', s.id)
  return u.id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureCourse(sb: any, o: { id: string; moodle_course_id: string | null; code: string | null }): Promise<number | null> {
  if (o.moodle_course_id) return Number(o.moodle_course_id)
  if (!o.code) return null
  const c = await getCourseByCode(o.code)
  if (!c) return null
  await sb.from('semester_offerings').update({ moodle_course_id: String(c.id) }).eq('id', o.id)
  return c.id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadGroupCourses(sb: any, groupId: string) {
  const { data: offs } = await sb.from('semester_offerings')
    .select('id, moodle_course_id, course:academic_courses(name, code)').eq('group_id', groupId)
  const courseIds: number[] = []
  const unmapped: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (offs ?? []) as any[]) {
    const cid = await ensureCourse(sb, { id: o.id, moodle_course_id: o.moodle_course_id, code: o.course?.code ?? null })
    if (cid) courseIds.push(cid)
    else unmapped.push(o.course?.name ?? o.id)
  }
  return { courseIds, unmapped }
}

// Matricula/desmatricula UN estudiante en las aulas del grupo. Best-effort.
export async function provisionStudent(groupId: string, studentId: string, action: 'enrol' | 'unenrol'): Promise<SyncResult> {
  const result: SyncResult = { configured: moodleConfigured(), students_total: 1, with_account: 0, no_account: 0, enrol_ops: 0, courses_unmapped: [], errors: [] }
  if (!result.configured) return result
  const sb = admin()
  try {
    const { data: s } = await sb.from('academic_students').select('id, email, moodle_user_id, external_id').eq('id', studentId).maybeSingle()
    if (!s) { result.errors.push('Estudiante no encontrado'); return result }
    const { courseIds, unmapped } = await loadGroupCourses(sb, groupId)
    result.courses_unmapped = unmapped
    const uid = await ensureMoodleUser(sb, s)
    if (!uid) { result.no_account = 1; return result }
    result.with_account = 1
    for (const cid of courseIds) {
      try { action === 'enrol' ? await enrolUser(cid, uid) : await unenrolUser(cid, uid); result.enrol_ops++ }
      catch (e) { result.errors.push(e instanceof Error ? e.message : 'error') }
    }
  } catch (e) { result.errors.push(e instanceof Error ? e.message : 'error') }
  return result
}

// Re-aprovisiona TODOS los miembros del grupo (matricula). Útil tras logins SSO o mapear aulas.
export async function syncGroup(groupId: string): Promise<SyncResult> {
  const result: SyncResult = { configured: moodleConfigured(), students_total: 0, with_account: 0, no_account: 0, enrol_ops: 0, courses_unmapped: [], errors: [] }
  if (!result.configured) return result
  const sb = admin()
  try {
    const { courseIds, unmapped } = await loadGroupCourses(sb, groupId)
    result.courses_unmapped = unmapped
    const { data: members } = await sb.from('academic_group_students')
      .select('academic_students(id, email, moodle_user_id, external_id)').eq('group_id', groupId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const students = (members ?? []).map((m: any) => m.academic_students).filter(Boolean)
    result.students_total = students.length
    for (const s of students) {
      const uid = await ensureMoodleUser(sb, s)
      if (!uid) { result.no_account++; continue }
      result.with_account++
      for (const cid of courseIds) {
        try { await enrolUser(cid, uid); result.enrol_ops++ }
        catch (e) { result.errors.push(e instanceof Error ? e.message : 'error') }
      }
    }
  } catch (e) { result.errors.push(e instanceof Error ? e.message : 'error') }
  return result
}
