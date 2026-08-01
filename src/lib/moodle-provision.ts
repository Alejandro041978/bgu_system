import { createClient } from '@supabase/supabase-js'
import { getUserByEmail, getUserByIdnumber, getCourseByCode, enrolUser, enrolUsersBulk, unenrolUser, unenrolUsersBulk, moodleConfigured } from './moodle'
import { crearCuentaMoodle, notificarCuentaMoodle } from './moodle-account'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface SyncResult {
  configured: boolean
  students_total: number
  with_account: number
  no_account: number
  accounts_created: number
  enrol_ops: number
  courses_unmapped: string[]
  errors: string[]
}

interface StudentRow {
  id: string
  first_name: string | null
  last_name: string | null
  second_last_name: string | null
  email: string | null
  email_alt: string | null
  moodle_user_id: string | null
  external_id?: string | null
}

export const STUDENT_FIELDS = 'id, first_name, last_name, second_last_name, email, email_alt, moodle_user_id, external_id'

// ¿El estudiante tiene derecho a correo institucional? (Bachelor/Master/
// Doctorado). Si lo tiene pero aún no se le creó, NO se le fabrica cuenta
// Moodle con el personal: primero va su @blackwell.pro.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requiereCorreoInstitucional(sb: any, studentId: string): Promise<boolean> {
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('academic_programs(category:academic_programs_category(name))').eq('student_id', studentId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((enr ?? []) as any[]).some(e => /bachelor|master|doctor/i.test(e.academic_programs?.category?.name ?? ''))
}

// La cuenta Moodle se resuelve por external_id (= idnumber en Moodle, el
// Users.Id de SystemActiva: llave fiable en lo histórico), luego por correo
// institucional y personal. Si no existe, el ERP la CREA (relevo de
// SystemActiva): con el correo estudiantil para quienes tienen derecho
// (Bachelor/Master/Doctorado) y con el personal para el resto (p. ej. DCE).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureMoodleUser(sb: any, s: StudentRow, result: SyncResult): Promise<number | null> {
  if (s.moodle_user_id) return Number(s.moodle_user_id)
  let u: { id: number } | null = null
  if (s.external_id) u = await getUserByIdnumber(s.external_id)
  if (!u && s.email_alt) u = await getUserByEmail(s.email_alt)
  if (!u && s.email) u = await getUserByEmail(s.email)
  if (!u) {
    const nombre = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.id
    if (!s.email_alt && await requiereCorreoInstitucional(sb, s.id)) {
      result.errors.push(`${nombre}: crear primero su correo estudiantil (@blackwell.pro) — su programa da derecho y la cuenta Moodle debe nacer con él`)
      return null
    }
    const identidad = s.email_alt || s.email
    if (!identidad) {
      result.errors.push(`${nombre}: sin correo institucional ni personal, no se puede crear la cuenta Moodle`)
      return null
    }
    // La contraseña la genera el ERP y el aviso lo manda el ERP. Antes esto
    // usaba createpassword=1, que delega en el cron de Moodle: si el campus no
    // lo tiene corriendo —que es el caso— el estudiante quedaba creado, sin
    // contraseña y sin aviso, y nadie se enteraba.
    const cuenta = await crearCuentaMoodle({
      email: identidad,
      firstname: s.first_name || '—',
      lastname: [s.last_name, s.second_last_name].filter(Boolean).join(' ') || '—',
      idnumber: s.external_id ?? undefined,
    })
    result.accounts_created++
    u = { id: cuenta.moodle_user_id }

    // El aviso va al correo personal cuando existe: es el que el estudiante
    // puede abrir seguro. Si falla, la cuenta ya está creada y queda el botón
    // de reenviar credenciales en su ficha — no se pierde el aprovisionamiento
    // por un problema de correo.
    const destino = s.email || identidad
    try {
      await notificarCuentaMoodle({
        to: destino, nombre, usuario: identidad, password: cuenta.password,
      })
      await sb.from('academic_students').update({
        moodle_credentials_sent_at: new Date().toISOString(),
        moodle_credentials_sent_to: destino,
      }).eq('id', s.id)
    } catch (e) {
      result.errors.push(`${nombre}: cuenta creada pero no se pudo enviar el aviso (${e instanceof Error ? e.message : String(e)}) — usa "Reenviar credenciales" en su ficha`)
    }
  }
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

// Las aulas del grupo, resueltas por la COLECCIÓN del estudiante.
//
// Una asignatura tiene varias aulas —la regular, la del upgrade, la del campus
// asociado, la que se dicte en inglés— y cuál le toca a este estudiante lo
// dice su colección, no la oferta. La oferta queda como respaldo para las
// matrículas que todavía no tienen colección elegida.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadGroupCourses(sb: any, groupId: string, collectionId?: string | null) {
  const { data: offs } = await sb.from('semester_offerings')
    .select('id, moodle_course_id, course_id, course:academic_courses(name, code)').eq('group_id', groupId)

  // aula de cada asignatura dentro de la colección
  const porColeccion = new Map<string, number>()
  if (collectionId) {
    const { data: links } = await sb.from('moodle_course_links')
      .select('aula_id, course_id').eq('collection_id', collectionId).eq('kind', 'asignatura')
    for (const l of (links ?? []) as { aula_id: number; course_id: string }[]) {
      porColeccion.set(String(l.course_id), Number(l.aula_id))
    }
  }
  // El carrusel repite la misma asignatura en varios años y todas apuntan a la
  // MISMA aula Moodle → deduplicar para no matricular dos veces en cada aula.
  const courseIds = new Set<number>()
  const unmapped: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (offs ?? []) as any[]) {
    const deColeccion = o.course_id ? porColeccion.get(String(o.course_id)) : undefined
    const cid = deColeccion ?? await ensureCourse(sb, { id: o.id, moodle_course_id: o.moodle_course_id, code: o.course?.code ?? null })
    if (cid) courseIds.add(cid)
    else unmapped.push(o.course?.name ?? o.id)
  }
  return { courseIds: [...courseIds], unmapped: [...new Set(unmapped)] }
}

// La colección elegida en la matrícula de ese programa. Es lo que decide en
// cuál de las aulas de cada asignatura entra este estudiante.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function coleccionDe(sb: any, groupId: string, studentId: string): Promise<string | null> {
  const { data: gr } = await sb.from('academic_groups').select('program_id').eq('id', groupId).maybeSingle()
  if (!gr?.program_id) return null
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('collection_id').eq('student_id', studentId).eq('program_id', gr.program_id)
    .not('collection_id', 'is', null).limit(1).maybeSingle()
  return enr?.collection_id ?? null
}

// Matricula/desmatricula UN estudiante en las aulas del grupo. Best-effort.
export async function provisionStudent(groupId: string, studentId: string, action: 'enrol' | 'unenrol'): Promise<SyncResult> {
  const result: SyncResult = { configured: moodleConfigured(), students_total: 1, with_account: 0, no_account: 0, accounts_created: 0, enrol_ops: 0, courses_unmapped: [], errors: [] }
  if (!result.configured) return result
  const sb = admin()
  try {
    const { data: s } = await sb.from('academic_students').select(STUDENT_FIELDS).eq('id', studentId).maybeSingle()
    if (!s) { result.errors.push('Estudiante no encontrado'); return result }
    const { courseIds, unmapped } = await loadGroupCourses(sb, groupId, await coleccionDe(sb, groupId, studentId))
    result.courses_unmapped = unmapped
    const uid = await ensureMoodleUser(sb, s, result)
    if (!uid) { result.no_account = 1; return result }
    result.with_account = 1
    for (const cid of courseIds) {
      try { action === 'enrol' ? await enrolUser(cid, uid) : await unenrolUser(cid, uid); result.enrol_ops++ }
      catch (e) { result.errors.push(e instanceof Error ? e.message : 'error') }
    }
  } catch (e) { result.errors.push(e instanceof Error ? e.message : 'error') }
  return result
}

// Re-aprovisiona los miembros ACTIVOS del grupo (matricula). Útil tras mapear
// aulas. Solo activos: quien completó el carrusel ya fue desmatriculado por el
// motor y no debe volver a sus aulas. La matrícula va en LOTES (una llamada WS
// con cientos de pares) para que grupos grandes entren en el tiempo de Vercel.
export async function syncGroup(groupId: string): Promise<SyncResult> {
  const result: SyncResult = { configured: moodleConfigured(), students_total: 0, with_account: 0, no_account: 0, accounts_created: 0, enrol_ops: 0, courses_unmapped: [], errors: [] }
  if (!result.configured) return result
  const sb = admin()
  try {
    // Las aulas dependen de la COLECCIÓN de cada estudiante, así que no hay un
    // único juego para todo el grupo: en el mismo carrusel puede haber gente de
    // la colección regular y del campus asociado. Se resuelve una vez por
    // colección distinta y se reutiliza.
    const porColeccion = new Map<string, number[]>()
    const cargar = async (colId: string | null) => {
      const k = colId ?? '—'
      if (!porColeccion.has(k)) {
        const r = await loadGroupCourses(sb, groupId, colId)
        porColeccion.set(k, r.courseIds)
        result.courses_unmapped = [...new Set([...result.courses_unmapped, ...r.unmapped])]
      }
      return porColeccion.get(k)!
    }
    const { data: members } = await sb.from('academic_group_students')
      .select(`status, academic_students(${STUDENT_FIELDS})`).eq('group_id', groupId).eq('status', 'activo')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const students = (members ?? []).map((m: any) => m.academic_students).filter(Boolean)
    result.students_total = students.length

    const enrolments: { userid: number; courseid: number }[] = []
    for (const s of students) {
      const uid = await ensureMoodleUser(sb, s, result)
      if (!uid) { result.no_account++; continue }
      result.with_account++
      const suyas = await cargar(await coleccionDe(sb, groupId, s.id))
      for (const cid of suyas) enrolments.push({ userid: uid, courseid: cid })
    }
    for (let i = 0; i < enrolments.length; i += 300) {
      const wave = enrolments.slice(i, i + 300)
      try { await enrolUsersBulk(wave); result.enrol_ops += wave.length }
      catch (e) { result.errors.push(`lote ${i / 300 + 1}: ${e instanceof Error ? e.message : 'error'}`) }
    }

    // Reconciliación inversa: quien COMPLETÓ este carrusel no debe seguir en
    // sus aulas (el motor lo desmatriculó al avanzar; esto repara cualquier
    // residuo — p. ej. un sync viejo que lo haya vuelto a matricular).
    const { data: done } = await sb.from('academic_group_students')
      .select('academic_students(id, moodle_user_id)').eq('group_id', groupId).eq('status', 'completado')
    const unenrolments: { userid: number; courseid: number }[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (done ?? []) as any[]) {
      const uid = Number(m.academic_students?.moodle_user_id)
      if (!Number.isFinite(uid) || !uid) continue
      // Se desmatricula de las aulas de SU colección; si no tiene, de las que
      // resuelva la oferta, que es el comportamiento de siempre.
      const suyas = await cargar(await coleccionDe(sb, groupId, String(m.academic_students?.id)))
      for (const cid of suyas) unenrolments.push({ userid: uid, courseid: cid })
    }
    for (let i = 0; i < unenrolments.length; i += 300) {
      try { await unenrolUsersBulk(unenrolments.slice(i, i + 300)) }
      catch { /* best effort: desmatricular a quien no está matriculado puede fallar sin consecuencia */ }
    }
  } catch (e) { result.errors.push(e instanceof Error ? e.message : 'error') }
  return result
}
