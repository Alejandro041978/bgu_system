import { createClient } from '@supabase/supabase-js'
import { getUserByEmail, getUserByIdnumber, getCourseByCode, enrolUser, enrolUsersBulk, unenrolUser, unenrolUsersBulk, moodleConfigured, getMoodleUsersByIds, setUserIdnumber } from './moodle'
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
  if (!u) u = await getUserByIdnumber(String(s.id))   // llave canónica: el uuid
  if (!u && s.email_alt) u = await getUserByEmail(s.email_alt)
  if (!u && s.email) u = await getUserByEmail(s.email)
  // Cuenta encontrada SIN llave del puente (típico: hallada por correo): se le
  // escribe el uuid en el momento. Sin esto, el importador jamás la cruzará —
  // 92 estudiantes nativos del ERP cursaban sin que una sola nota fluyera
  // (caso Casanova, 07/09/2026).
  if (u) {
    try {
      const [mu] = await getMoodleUsersByIds([u.id])
      if (mu && !mu.idnumber) await setUserIdnumber(u.id, String(s.id))
    } catch { /* el backfill de la llave no bloquea el aprovisionamiento */ }
  }
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
      // Regla del usuario (07/09/2026): toda cuenta nueva nace con el UUID del
      // estudiante como idnumber — única llave del puente hacia adelante. Las
      // llaves de Activa se leen donde ya existen; no se generan nunca más.
      idnumber: String(s.id),
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
        triggeredBy: 'sistema:aprovisionamiento',
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
export async function loadGroupCourses(sb: any, groupId: string, collectionId?: string | null) {
  // Las asignaturas las declara el CARRUSEL. Antes se leían de las ofertas del
  // semestre, así que la misma asignatura llegaba repetida —una vez por año
  // ofertado— y había que deduplicar aquí. Ahora vienen sin repetir de origen.
  const cursos = await asignaturasDeGrupo(sb, groupId)

  // aula de cada asignatura dentro de la colección
  const porColeccion = new Map<string, number>()
  if (collectionId) {
    const { data: links } = await sb.from('moodle_course_links')
      .select('aula_id, course_id').eq('collection_id', collectionId).eq('kind', 'asignatura')
      .is('replaced_at', null)
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
  // Qué aula corresponde a qué asignatura del ERP: lo necesita la exclusión de
  // campus externo por estudiante (quitar SOLO el aula de la asignatura marcada).
  const aulaDeCurso = new Map<string, number>()
  const unmapped: string[] = []
  for (const c of cursos) {
    // Casilla electiva: no tiene aula propia — el aula es la de la ELECCIÓN
    // de cada estudiante (aulasDeElecciones), así que ni se resuelve ni se
    // reclama como "sin aula" (fase 2b de electivas, 08/09/2026).
    if (c.is_elective) continue
    if (collectionId) {
      const deColeccion = porColeccion.get(String(c.id))
      if (deColeccion) { courseIds.add(deColeccion); aulaDeCurso.set(String(c.id), deColeccion) }
      else unmapped.push(c.name ?? c.id)
      continue
    }
    const o = porOferta.get(String(c.id))
    const cid = o
      ? await ensureCourse(sb, { id: o.id, moodle_course_id: o.aula, code: c.code ?? null })
      : null
    if (cid) { courseIds.add(cid); aulaDeCurso.set(String(c.id), cid) }
    else unmapped.push(c.name ?? c.id)
  }
  // por_respaldo: este juego de aulas no salió de una colección. Se devuelve
  // para que quien llame pueda contarlo y enseñarlo, en vez de que el respaldo
  // siga siendo invisible mientras sostiene al 98% de los estudiantes.
  return { courseIds: [...courseIds], aulaDeCurso, unmapped: [...new Set(unmapped)], por_respaldo: !collectionId }
}

// Pares campus-externo de estos estudiantes: student_id → set de course_ids
// que cursan fuera. El aprovisionador no les da (y les quita) el aula de esas
// asignaturas: su nota entra por Notas de campus externo y el importador ya
// los salta — dejarles el aula sería invitar al reclamo "yo tenía nota ahí".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function externosDeEstudiantes(sb: any, studentIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  if (!studentIds.length) return out
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data } = await sb.from('external_campus_students')
      .select('student_id, course_id').in('student_id', studentIds.slice(i, i + 200))
    for (const r of (data ?? []) as { student_id: string; course_id: string }[]) {
      const k = String(r.student_id)
      if (!out.has(k)) out.set(k, new Set())
      out.get(k)!.add(String(r.course_id))
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Las aulas de las ELECCIONES de electivas de los miembros de un carrusel.
//
// Las casillas electivas del grupo no tienen aula propia: cada estudiante va
// al aula de SU asignatura elegida — dos compañeros del mismo carrusel pueden
// ir a aulas distintas (Finance vs HR). El aula de la elegida se resuelve por
// la colección del estudiante primero y por cualquier vínculo vivo después;
// sin vínculo, se reporta con nombre en courses_unmapped.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function aulasDeElecciones(sb: any, groupId: string, studentIds: string[]): Promise<{ porEstudiante: Map<string, number[]>; unmapped: string[] }> {
  const vacio = { porEstudiante: new Map<string, number[]>(), unmapped: [] as string[] }
  if (!studentIds.length) return vacio
  const cursos = await asignaturasDeGrupo(sb, groupId)
  const casillas = new Set(cursos.filter(c => c.is_elective).map(c => String(c.id)))
  if (!casillas.size) return vacio
  const { data: gr } = await sb.from('academic_groups').select('program_id').eq('id', groupId).maybeSingle()
  if (!gr?.program_id) return vacio

  const { data: enrs } = await sb.from('academic_student_enrollments')
    .select('id, student_id, collection_id').eq('program_id', gr.program_id).in('student_id', studentIds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrRows = (enrs ?? []) as any[]
  if (!enrRows.length) return vacio
  const estudianteDe = new Map(enrRows.map(e => [String(e.id), String(e.student_id)]))
  const coleccionDeEstudiante = new Map(enrRows.map(e => [String(e.student_id), e.collection_id ? String(e.collection_id) : null]))

  const { data: els } = await sb.from('student_electives')
    .select('enrollment_id, slot_course_id, chosen:academic_courses!chosen_course_id(id, code, name)')
    .in('enrollment_id', enrRows.map(e => String(e.id)))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elecciones = ((els ?? []) as any[]).filter(e => casillas.has(String(e.slot_course_id)) && e.chosen)
  if (!elecciones.length) return vacio

  const chosenIds = [...new Set(elecciones.map(e => String(e.chosen.id)))]
  const { data: links } = await sb.from('moodle_course_links')
    .select('aula_id, course_id, collection_id').eq('kind', 'asignatura').is('replaced_at', null)
    .in('course_id', chosenIds)
  const porColeccionLink = new Map<string, number>()   // `${course}|${coleccion}` → aula
  const cualquierLink = new Map<string, number>()      // course → primera aula viva
  for (const l of (links ?? []) as { aula_id: number; course_id: string; collection_id: string | null }[]) {
    if (l.collection_id) porColeccionLink.set(`${l.course_id}|${l.collection_id}`, Number(l.aula_id))
    if (!cualquierLink.has(String(l.course_id))) cualquierLink.set(String(l.course_id), Number(l.aula_id))
  }

  // Un par marcado como campus externo tampoco recibe el aula de su ELEGIDA.
  const externos = await externosDeEstudiantes(sb, studentIds)

  const porEstudiante = new Map<string, number[]>()
  const unmapped = new Set<string>()
  for (const el of elecciones) {
    const sid = estudianteDe.get(String(el.enrollment_id))
    if (!sid) continue
    if (externos.get(sid)?.has(String(el.chosen.id))) continue
    const col = coleccionDeEstudiante.get(sid)
    const aula = (col ? porColeccionLink.get(`${el.chosen.id}|${col}`) : undefined) ?? cualquierLink.get(String(el.chosen.id))
    if (!aula) { unmapped.add(`${[el.chosen.code, el.chosen.name].filter(Boolean).join(' ')} (electiva elegida)`); continue }
    if (!porEstudiante.has(sid)) porEstudiante.set(sid, [])
    porEstudiante.get(sid)!.push(aula)
  }
  return { porEstudiante, unmapped: [...unmapped] }
}

// La colección elegida en la matrícula de ese programa. Es lo que decide en
// cuál de las aulas de cada asignatura entra este estudiante.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function coleccionDe(sb: any, groupId: string, studentId: string): Promise<string | null> {
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
    const { courseIds, aulaDeCurso, unmapped, por_respaldo } = await loadGroupCourses(sb, groupId, await coleccionDe(sb, groupId, studentId))
    // Las aulas de SUS elecciones de electivas viajan con las del grupo: el
    // alta las incluye, y la baja (avance de carrusel) también — para no
    // dejar accesos colgados en aulas de elegidas.
    const elecciones = await aulasDeElecciones(sb, groupId, [studentId]).catch(() => ({ porEstudiante: new Map<string, number[]>(), unmapped: [] as string[] }))
    result.courses_unmapped = [...unmapped, ...elecciones.unmapped]
    if (por_respaldo) result.sin_coleccion = 1
    const uid = await ensureMoodleUser(sb, s, result)
    if (!uid) { result.no_account = 1; return result }
    result.with_account = 1
    // Campus externo por estudiante: el aula de la asignatura marcada no se le
    // da — y en el alta se le retira activamente si la tuviera.
    const externosSet = (await externosDeEstudiantes(sb, [studentId])).get(String(studentId)) ?? new Set<string>()
    const aulasExcluidas = new Set<number>()
    for (const [cursoId, aula] of aulaDeCurso) if (externosSet.has(cursoId)) aulasExcluidas.add(aula)
    const aulas = [...courseIds, ...(elecciones.porEstudiante.get(String(studentId)) ?? [])]
      .filter(cid => !aulasExcluidas.has(cid))
    for (const cid of aulas) {
      try { action === 'enrol' ? await enrolUser(cid, uid) : await unenrolUser(cid, uid); result.enrol_ops++ }
      catch (e) { result.errors.push(e instanceof Error ? e.message : 'error') }
    }
    if (action === 'enrol') {
      for (const cid of aulasExcluidas) {
        try { await unenrolUser(cid, uid) }
        catch { /* si no estaba matriculado, no hay nada que retirar */ }
      }
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
    const porColeccion = new Map<string, { courseIds: number[]; aulaDeCurso: Map<string, number> }>()
    const cargar = async (colId: string | null) => {
      const k = colId ?? '—'
      if (!porColeccion.has(k)) {
        const r = await loadGroupCourses(sb, groupId, colId)
        porColeccion.set(k, { courseIds: r.courseIds, aulaDeCurso: r.aulaDeCurso })
        result.courses_unmapped = [...new Set([...result.courses_unmapped, ...r.unmapped])]
      }
      return porColeccion.get(k)!
    }
    const { data: members } = await sb.from('academic_group_students')
      .select(`status, academic_students(${STUDENT_FIELDS})`).eq('group_id', groupId).eq('status', 'activo')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const students = (members ?? []).map((m: any) => m.academic_students).filter(Boolean)
    result.students_total = students.length

    // Aulas de las ELECCIONES de electivas de los miembros: se resuelven una
    // vez para todo el grupo, y cada estudiante recibe además las suyas.
    const elecciones = await aulasDeElecciones(sb, groupId, students.map((s: { id: string }) => String(s.id)))
      .catch(() => ({ porEstudiante: new Map<string, number[]>(), unmapped: [] as string[] }))
    result.courses_unmapped = [...new Set([...result.courses_unmapped, ...elecciones.unmapped])]

    // Campus externo por estudiante: a los pares marcados no se les da el aula
    // de esa asignatura, y si ya la tenían se les retira (suspende) aquí mismo.
    const externosGrupo = await externosDeEstudiantes(sb, students.map((s: { id: string }) => String(s.id)))
    const bajasExternos: { userid: number; courseid: number }[] = []

    const enrolments: { userid: number; courseid: number }[] = []
    for (const s of students) {
      const uid = await ensureMoodleUser(sb, s, result)
      if (!uid) { result.no_account++; continue }
      result.with_account++
      const col = await coleccionDe(sb, groupId, s.id)
      if (!col) result.sin_coleccion++
      const suyas = await cargar(col)
      const fuera = externosGrupo.get(String(s.id))
      const aulasFuera = new Set<number>()
      if (fuera?.size) for (const [cursoId, aula] of suyas.aulaDeCurso) if (fuera.has(cursoId)) aulasFuera.add(aula)
      for (const cid of suyas.courseIds) {
        if (aulasFuera.has(cid)) { bajasExternos.push({ userid: uid, courseid: cid }); continue }
        enrolments.push({ userid: uid, courseid: cid })
      }
      for (const cid of elecciones.porEstudiante.get(String(s.id)) ?? []) enrolments.push({ userid: uid, courseid: cid })
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doneRows = (done ?? []) as any[]
    const eleccionesDone = await aulasDeElecciones(sb, groupId, doneRows.map(m => String(m.academic_students?.id)).filter(Boolean))
      .catch(() => ({ porEstudiante: new Map<string, number[]>(), unmapped: [] as string[] }))
    const unenrolments: { userid: number; courseid: number }[] = []
    for (const m of doneRows) {
      const uid = Number(m.academic_students?.moodle_user_id)
      if (!Number.isFinite(uid) || !uid) continue
      // Se desmatricula de las aulas de SU colección; si no tiene, de las que
      // resuelva la oferta, que es el comportamiento de siempre. Las aulas de
      // sus elecciones de electivas también: sin esto quedaban accesos colgados.
      const suyas = await cargar(await coleccionDe(sb, groupId, String(m.academic_students?.id)))
      for (const cid of suyas.courseIds) unenrolments.push({ userid: uid, courseid: cid })
      for (const cid of eleccionesDone.porEstudiante.get(String(m.academic_students?.id)) ?? []) unenrolments.push({ userid: uid, courseid: cid })
    }
    // Las bajas de campus externo viajan en las mismas olas de desmatrícula.
    unenrolments.push(...bajasExternos)
    for (let i = 0; i < unenrolments.length; i += 300) {
      try { await unenrolUsersBulk(unenrolments.slice(i, i + 300)) }
      catch { /* best effort: desmatricular a quien no está matriculado puede fallar sin consecuencia */ }
    }
  } catch (e) { result.errors.push(e instanceof Error ? e.message : 'error') }
  return result
}
