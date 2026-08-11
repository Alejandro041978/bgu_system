import { createClient } from '@supabase/supabase-js'
import { getUserByEmail, getUserByIdnumber, getCourseByCode, enrolUser, enrolUsersBulk, unenrolUser, unenrolUsersBulk, moodleConfigured } from './moodle'
import { crearCuentaMoodle, notificarCuentaMoodle } from './moodle-account'
import { asignaturasDeGrupo } from './group-courses'

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
  // Estudiantes cuyas aulas se resolvieron por el respaldo (la oferta) porque
  // su matrícula no tiene colección. Es la deuda que queda por saldar, y se
  // cuenta para que se vea en vez de suponerse.
  sin_coleccion: number
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
// dice su colección, no la oferta. La oferta queda como respaldo SOLO para las
// matrículas que todavía no tienen colección elegida.
//
// ── La colección no se mezcla con el respaldo ────────────────────────────────
//
// Antes el respaldo actuaba POR ASIGNATURA: si la colección del estudiante no
// tenía aula para una asignatura, se usaba la de la oferta. Y la oferta tiene
// una sola aula por asignatura, la de la colección regular. Resultado: el
// estudiante caía en el aula de OTRA colección para esa asignatura, sin que
// nada lo dijera.
//
// No era hipotético. Medido el 10-08-2026: 7 colecciones con 39 casillas
// vacías que la oferta rellenaba en silencio. La peor, BBA Upgrade ES —16 de
// las 33 asignaturas de su carrusel—, que es justo donde el backfill va a
// colocar a 98 estudiantes: media carrera del upgrade en las aulas regulares.
//
// Ahora, si el estudiante TIENE colección, sus aulas salen únicamente de ella.
// La casilla vacía se reporta como asignatura sin aula (courses_unmapped) y se
// arregla poniéndole el aula que le toca, que es lo que había que hacer desde
// el principio. Quedarse sin matricular en una asignatura se ve; entrar al
// aula equivocada no se ve.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadGroupCourses(sb: any, groupId: string, collectionId?: string | null) {
  // Las asignaturas las declara el CARRUSEL. Antes se leían de las ofertas del
  // semestre, así que la misma asignatura llegaba repetida —una vez por año
  // ofertado— y había que deduplicar aquí. Ahora vienen sin repetir de origen.
  const cursos = await asignaturasDeGrupo(sb, groupId)

  // aula de cada asignatura dentro de la colección
  const porColeccion = new Map<string, number>()
  if (collectionId) {
    const { data: links } = await sb.from('moodle_course_links')
      .select('aula_id, course_id').eq('collection_id', collectionId).eq('kind', 'asignatura')
    for (const l of (links ?? []) as { aula_id: number; course_id: string }[]) {
      porColeccion.set(String(l.course_id), Number(l.aula_id))
    }
  }
  // Respaldo para quien todavía no tiene colección: el aula que la oferta tenga
  // registrada para esa asignatura. Se resuelve por asignatura, no por oferta,
  // porque la oferta ya no manda aquí.
  const porOferta = new Map<string, { id: string; aula: string | null }>()
  if (!collectionId) {
    const { data: offs } = await sb.from('semester_offerings')
      .select('id, moodle_course_id, course_id').eq('group_id', groupId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const o of (offs ?? []) as any[]) {
      if (!o.course_id) continue
      const prev = porOferta.get(String(o.course_id))
      // Se prefiere la que ya tiene aula puesta.
      if (!prev || (!prev.aula && o.moodle_course_id)) {
        porOferta.set(String(o.course_id), { id: String(o.id), aula: o.moodle_course_id ? String(o.moodle_course_id) : null })
      }
    }
  }

  const courseIds = new Set<number>()
  const unmapped: string[] = []
  for (const c of cursos) {
    if (collectionId) {
      const deColeccion = porColeccion.get(String(c.id))
      if (deColeccion) courseIds.add(deColeccion)
      else unmapped.push(c.name ?? c.id)
      continue
    }
    const o = porOferta.get(String(c.id))
    const cid = o
      ? await ensureCourse(sb, { id: o.id, moodle_course_id: o.aula, code: c.code ?? null })
      : null
    if (cid) courseIds.add(cid)
    else unmapped.push(c.name ?? c.id)
  }
  // por_respaldo: este juego de aulas no salió de una colección. Se devuelve
  // para que quien llame pueda contarlo y enseñarlo, en vez de que el respaldo
  // siga siendo invisible mientras sostiene al 98% de los estudiantes.
  return { courseIds: [...courseIds], unmapped: [...new Set(unmapped)], por_respaldo: !collectionId }
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

// ---------------------------------------------------------------------------
// Marca un carrusel como pendiente de sincronizar con el campus.
//
// Colocar a alguien en un carrusel es una decisión académica: dice qué cursa y
// en qué orden avanza. Que el campus se parezca a esa decisión —matricularlo en
// las aulas que su colección tenga para esas asignaturas— es una consecuencia,
// y la hace UN solo sitio: el reconciliador (cron moodle-enrol-sync).
//
// Antes la hacían cuatro: la colocación automática, la colocación individual,
// la matrícula y el motor de avance. Con cuatro dueños, "quién matricula en las
// aulas" no tenía una respuesta, y cada página del dominio del carrusel tenía
// que hablar de Moodle sin que fuera asunto suyo.
//
// El aviso no necesita una tabla nueva: el cron ya atiende primero a quien
// lleva más tiempo sin revisarse, y un null va delante de cualquier fecha. Así
// que vaciar last_enrol_sync_at pone a este carrusel el primero de la cola.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function marcarParaSincronizar(sb: any, groupId: string): Promise<void> {
  try { await sb.from('academic_groups').update({ last_enrol_sync_at: null }).eq('id', groupId) }
  catch { /* el cron pasa igual por rotación; esto solo adelanta el turno */ }
}

// Matricula/desmatricula UN estudiante en las aulas del grupo. Best-effort.
//
// La BAJA se sigue llamando en el momento —quien completó un carrusel no debe
// seguir una hora más en aulas que ya no le tocan—. El ALTA la hace el
// reconciliador.
export async function provisionStudent(groupId: string, studentId: string, action: 'enrol' | 'unenrol'): Promise<SyncResult> {
  const result: SyncResult = { configured: moodleConfigured(), students_total: 1, with_account: 0, no_account: 0, accounts_created: 0, enrol_ops: 0, courses_unmapped: [], sin_coleccion: 0, errors: [] }
  if (!result.configured) return result
  const sb = admin()
  try {
    const { data: s } = await sb.from('academic_students').select(STUDENT_FIELDS).eq('id', studentId).maybeSingle()
    if (!s) { result.errors.push('Estudiante no encontrado'); return result }
    const { courseIds, unmapped, por_respaldo } = await loadGroupCourses(sb, groupId, await coleccionDe(sb, groupId, studentId))
    result.courses_unmapped = unmapped
    if (por_respaldo) result.sin_coleccion = 1
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
  const result: SyncResult = { configured: moodleConfigured(), students_total: 0, with_account: 0, no_account: 0, accounts_created: 0, enrol_ops: 0, courses_unmapped: [], sin_coleccion: 0, errors: [] }
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
      const col = await coleccionDe(sb, groupId, s.id)
      if (!col) result.sin_coleccion++
      const suyas = await cargar(col)
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
