// Cliente de Moodle Web Services (REST). Lee credenciales de variables de entorno.
// NUNCA hardcodear el token: se configura en Vercel (MOODLE_URL, MOODLE_WS_TOKEN).

const BASE = process.env.MOODLE_URL
const TOKEN = process.env.MOODLE_WS_TOKEN
export const MOODLE_STUDENT_ROLEID = Number(process.env.MOODLE_STUDENT_ROLEID || '5')

// Cinturón de seguridad (incidente 2026-07-22: MOODLE_STUDENT_ROLEID quedó en
// 1 y el ERP matriculó ~5,700 estudiantes como MANAGER, con edición y acceso
// a respuestas). Los ids 1-4 son roles de poder en Moodle estándar
// (manager/coursecreator/editingteacher/teacher): jamás son "estudiante".
function assertStudentRole(roleid: number) {
  if (!Number.isFinite(roleid) || roleid <= 4) {
    throw new Error(`MOODLE_STUDENT_ROLEID=${roleid} es un rol de poder (manager/teacher), no de estudiante: corregir la variable en Vercel (student = 5). Matrícula BLOQUEADA por seguridad.`)
  }
}
export const MOODLE_COURSE_MATCH_FIELD = process.env.MOODLE_COURSE_MATCH_FIELD || 'shortname' // 'shortname' | 'idnumber'

export function moodleConfigured(): boolean {
  return !!BASE && !!TOKEN
}

// Aplana objetos/arrays al formato que espera Moodle: key[0][field]=value
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function append(body: URLSearchParams, value: any, prefix: string) {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    value.forEach((item, i) => append(body, item, `${prefix}[${i}]`))
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) append(body, v, `${prefix}[${k}]`)
  } else {
    body.append(prefix, String(value))
  }
}

/** Llama una función de Moodle WS. Lanza Error si Moodle devuelve una excepción. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function moodleCall(wsfunction: string, params: Record<string, any> = {}): Promise<any> {
  if (!BASE || !TOKEN) throw new Error('Moodle no configurado (faltan MOODLE_URL / MOODLE_WS_TOKEN)')
  const body = new URLSearchParams({ wstoken: TOKEN, moodlewsrestformat: 'json', wsfunction })
  for (const [k, v] of Object.entries(params)) append(body, v, k)

  const res = await fetch(`${BASE}/webservice/rest/server.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json().catch(() => null)
  if (data && data.exception) throw new Error(`${data.errorcode}: ${data.message}`)
  return data
}

// ---- Helpers de alto nivel ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSiteInfo(): Promise<any> {
  return moodleCall('core_webservice_get_site_info', {})
}

export async function getUserByEmail(email: string): Promise<{ id: number } | null> {
  const users = await moodleCall('core_user_get_users_by_field', { field: 'email', values: [email] })
  return Array.isArray(users) && users.length ? users[0] : null
}

// El idnumber de Moodle es el Users.Id de SystemActiva, que guardamos en
// academic_students.external_id — es la llave FIABLE (el correo de Moodle es el
// institucional y nosotros guardamos el personal; casi nunca coinciden).
export async function getUserByIdnumber(idnumber: string): Promise<{ id: number } | null> {
  const users = await moodleCall('core_user_get_users_by_field', { field: 'idnumber', values: [idnumber] })
  return Array.isArray(users) && users.length ? users[0] : null
}

export async function getCourseByCode(code: string): Promise<{ id: number } | null> {
  const res = await moodleCall('core_course_get_courses_by_field', { field: MOODLE_COURSE_MATCH_FIELD, value: code })
  const courses = res?.courses
  return Array.isArray(courses) && courses.length ? courses[0] : null
}

// Crea la cuenta Moodle con la convención histórica del campus (la que usaba
// SystemActiva): auth manual y username = el correo, en minúsculas. Moodle
// genera la contraseña y la envía él mismo al correo de la cuenta.
export async function createMoodleUser(u: {
  email: string; firstname: string; lastname: string; idnumber?: string
}): Promise<number> {
  const created = await moodleCall('core_user_create_users', {
    users: [{
      username: u.email.trim().toLowerCase(),
      email: u.email.trim().toLowerCase(),
      firstname: u.firstname,
      lastname: u.lastname,
      auth: 'manual',
      createpassword: 1,
      ...(u.idnumber ? { idnumber: u.idnumber } : {}),
    }],
  })
  const id = Number(created?.[0]?.id)
  if (!Number.isFinite(id)) throw new Error('Moodle no devolvió el id del usuario creado')
  return id
}

export async function enrolUser(courseid: number, userid: number, roleid = MOODLE_STUDENT_ROLEID): Promise<void> {
  assertStudentRole(roleid)
  await moodleCall('enrol_manual_enrol_users', { enrolments: [{ roleid, userid, courseid }] })
}

// Matrícula masiva: una sola llamada WS con cientos de pares (usuario, aula).
// Para syncs de grupos grandes — evita miles de round-trips.
export async function enrolUsersBulk(enrolments: { userid: number; courseid: number }[], roleid = MOODLE_STUDENT_ROLEID): Promise<void> {
  if (!enrolments.length) return
  assertStudentRole(roleid)
  await moodleCall('enrol_manual_enrol_users', { enrolments: enrolments.map(e => ({ roleid, ...e })) })
}

export async function unenrolUsersBulk(enrolments: { userid: number; courseid: number }[]): Promise<void> {
  if (!enrolments.length) return
  await moodleCall('enrol_manual_unenrol_users', { enrolments })
}

export async function unenrolUser(courseid: number, userid: number): Promise<void> {
  await moodleCall('enrol_manual_unenrol_users', { enrolments: [{ userid, courseid }] })
}
