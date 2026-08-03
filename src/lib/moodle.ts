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

/** Llama una función de Moodle WS. Lanza Error si Moodle devuelve una excepción.
 * timeoutMs: los reportes de aulas grandes (500+ estudiantes) tardan minutos;
 * el llamador decide cuánto puede esperar (default 90s para llamadas chicas). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function moodleCall(wsfunction: string, params: Record<string, any> = {}, opts: { timeoutMs?: number } = {}): Promise<any> {
  if (!BASE || !TOKEN) throw new Error('Moodle no configurado (faltan MOODLE_URL / MOODLE_WS_TOKEN)')
  const body = new URLSearchParams({ wstoken: TOKEN, moodlewsrestformat: 'json', wsfunction })
  for (const [k, v] of Object.entries(params)) append(body, v, k)

  const res = await fetch(`${BASE}/webservice/rest/server.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
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

// Búsqueda LAXA por nombre (para localizar cuentas sin llave fiable). Requiere
// que el token tenga core_user_get_users; si no, devuelve null (no disponible).
export async function findMoodleUsersByName(firstname: string, lastname: string): Promise<{ id: number; email: string; suspended: number }[] | null> {
  try {
    const res = await moodleCall('core_user_get_users', {
      criteria: [{ key: 'firstname', value: firstname }, { key: 'lastname', value: lastname }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res?.users ?? []).map((u: any) => ({ id: Number(u.id), email: u.email, suspended: Number(u.suspended) }))
  } catch {
    return null
  }
}

export async function getCourseByCode(code: string): Promise<{ id: number } | null> {
  const res = await moodleCall('core_course_get_courses_by_field', { field: MOODLE_COURSE_MATCH_FIELD, value: code })
  const courses = res?.courses
  return Array.isArray(courses) && courses.length ? courses[0] : null
}

// La creación de cuentas de estudiante vive en moodle-account.ts: el ERP
// genera la contraseña de primer uso, se la pasa a Moodle con "cambiar al
// primer ingreso" y manda él el aviso. La vía anterior (createpassword=1)
// delegaba en el cron de Moodle y dejaba estudiantes creados sin contraseña y
// sin correo, así que se retiró para que nadie la reintroduzca por error.

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

// Suspende o reactiva la cuenta Moodle. Suspendida = no puede iniciar sesión.
// Requiere que el token tenga habilitada la función core_user_update_users.
export async function setUserSuspended(userid: number, suspended: boolean): Promise<void> {
  await moodleCall('core_user_update_users', { users: [{ id: userid, suspended: suspended ? 1 : 0 }] })

  // Se RELEE. core_user_update_users devuelve null tanto si aplicó el cambio
  // como si ignoró el campo, y el 26/07/2026 pasó exactamente eso: 59 cuentas
  // morosas recibieron la orden de suspensión, Moodle no devolvió error, el ERP
  // se anotó "suspendido"… y el campo quedó en 0. Como el motor se fiaba de su
  // propia anotación, no volvió a intentarlo nunca: la restricción se cayó en
  // silencio durante semanas.
  //
  // Confirmar cuesta una llamada más y convierte un fallo invisible en un error
  // que se ve y se reintenta.
  const users = await moodleCall('core_user_get_users_by_field', { field: 'id', values: [String(userid)] })
  const real = Array.isArray(users) && users[0] ? Number(users[0].suspended) === 1 : null
  if (real === null) throw new Error(`Moodle no devolvió la cuenta ${userid} al verificar la suspensión`)
  if (real !== suspended) {
    throw new Error(
      `Moodle aceptó la llamada pero la cuenta ${userid} sigue ${real ? 'suspendida' : 'activa'}: ` +
      'el servicio web no está aplicando el campo suspended. Revisar los permisos del token en el campus.')
  }
}

// Resuelve el id de Moodle: primero por idnumber (= external_id, llave de los
// importados de SystemActiva) y luego por cada correo dado (institucional primero,
// personal después — los nativos tienen external_id UUID y viven con el @blackwell.pro).
export async function resolveMoodleUserId(idnumber: string | null, ...emails: (string | null | undefined)[]): Promise<number | null> {
  if (idnumber && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(idnumber)) { // un UUID no es idnumber de Moodle
    const u = await getUserByIdnumber(idnumber).catch(() => null)
    if (u?.id) return Number(u.id)
  }
  for (const e of emails) {
    if (!e) continue
    const u = await getUserByEmail(e.trim().toLowerCase()).catch(() => null)
    if (u?.id) return Number(u.id)
  }
  return null
}

// ---------------------------------------------------------------------------
// Estado REAL de suspensión en el campus, por lotes.
//
// El ERP guarda en academic_students.moodle_suspended lo que él cree haber
// hecho. Si un administrador reactiva una cuenta desde Moodle, esa creencia
// queda desfasada y el motor de accesos ya no vuelve a suspenderla: para él
// "ya está suspendida". Esto lee la verdad del otro lado para poder contrastar.
// ---------------------------------------------------------------------------
export async function suspendedByMoodleIds(ids: number[]): Promise<Map<number, boolean>> {
  const out = new Map<number, boolean>()
  const limpios = [...new Set(ids.filter(n => Number.isFinite(n) && n > 0))]
  for (let i = 0; i < limpios.length; i += 100) {
    const lote = limpios.slice(i, i + 100)
    try {
      const users = await moodleCall('core_user_get_users_by_field', {
        field: 'id', values: lote.map(String),
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const u of (users ?? []) as any[]) out.set(Number(u.id), Number(u.suspended) === 1)
    } catch { /* el lote que falle queda sin dato: se reporta como no verificable */ }
  }
  return out
}
