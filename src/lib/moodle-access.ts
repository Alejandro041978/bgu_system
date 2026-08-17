import { setUserSuspended, resolveMoodleUserId, moodleConfigured, findMoodleUsersByName, suspendedByMoodleIds } from './moodle'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

// Tope de excepciones de autoservicio (portal del estudiante) por semestre.
export const SELF_SERVICE_MAX_PER_SEMESTER = 2

export interface AccessRow {
  student_id: string
  name: string
  document: string | null
  email: string | null
  email_alt: string | null
  external_id: string | null
  moodle_user_id: number | null
  no_account: boolean
  overdue: number
  // Retiro involuntario vigente. Cierra el campus por sí solo, sin mirar deuda.
  iw: boolean
  has_exception: boolean
  exception_id: string | null
  exception_expires: string | null
  exception_source: string | null
  exception_justification: string | null
  currently_suspended: boolean
  desired_suspended: boolean
  action: 'suspend' | 'unsuspend' | 'none'
}

// Vencido por estudiante: suma del saldo de cuotas con vencimiento <= hoy e impagas.
// Mismo criterio que el estado de cuenta (saldo = monto − pagos, descuentos incluidos).
// Sólo la TUITION cierra el acceso al campus (regla del usuario, 2026-08-03).
//
// Antes contaba cualquier cargo vencido, y eso metía en la lista de suspendidos
// a estudiantes que debían 1, 10 o 35 dólares de un trámite, un examen o un
// documento. Cerrarle el aula a alguien por un dólar de una constancia no es lo
// que Cobranzas quiso; la deuda que justifica cortar el servicio es la del
// servicio mismo.
//
//   1 = matrícula (sin vencimiento, nunca cuenta)
//   2 = tuition  ← la única que suspende
//   3 = trámites, exámenes y documentos
//   4 = importe cero
const CHARGE_TYPE_TUITION = 2

export async function overdueByStudent(sb: SB): Promise<Map<string, number>> {
  const today = new Date().toISOString().slice(0, 10)
  const charges: { external_id: string; student_id: string; amount: number; due_date: string }[] = []
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('account_charges')
      .select('external_id, student_id, amount, due_date')
      .eq('charge_type', CHARGE_TYPE_TUITION)
      .not('due_date', 'is', null).lte('due_date', today).range(f, f + 999)
    charges.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const paid = new Map<string, number>()
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('account_payments')
      .select('charge_external_id, amount').not('charge_external_id', 'is', null).range(f, f + 999)
    for (const p of data ?? []) paid.set(p.charge_external_id, (paid.get(p.charge_external_id) ?? 0) + Number(p.amount || 0))
    if ((data ?? []).length < 1000) break
  }
  const over = new Map<string, number>()
  for (const c of charges) {
    if (!c.student_id) continue
    const bal = Number(c.amount || 0) - (paid.get(c.external_id) ?? 0)
    if (bal > 0.005) over.set(c.student_id, (over.get(c.student_id) ?? 0) + bal)
  }
  return over
}

export interface ActiveException { id: string; expires_at: string; source: string; justification: string | null }

// student_id → excepción vigente (la más lejana), con su id, origen y justificación.
export async function activeExceptionMap(sb: SB): Promise<Map<string, ActiveException>> {
  const now = new Date().toISOString()
  // 'source'/'justification' son opcionales (migración): tolerante si no existen.
  let data: { id: string; student_id: string; expires_at: string; source?: string; justification?: string | null }[] | null = null
  try {
    ({ data } = await sb.from('moodle_access_exceptions').select('id, student_id, expires_at, source, justification').gt('expires_at', now))
  } catch {
    ({ data } = await sb.from('moodle_access_exceptions').select('id, student_id, expires_at').gt('expires_at', now))
  }
  const m = new Map<string, ActiveException>()
  for (const e of data ?? []) {
    const prev = m.get(e.student_id)
    if (!prev || e.expires_at > prev.expires_at) m.set(e.student_id, { id: e.id, expires_at: e.expires_at, source: e.source ?? 'asesor', justification: e.justification ?? null })
  }
  return m
}

// Semestre académico vigente (el que contiene hoy), si existe.
export async function currentSemesterRange(sb: SB): Promise<{ start: string; end: string } | null> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await sb.from('academic_semesters')
    .select('start_date, end_date').lte('start_date', today).gte('end_date', today)
    .order('start_date', { ascending: false }).limit(1).maybeSingle()
  return data?.start_date && data?.end_date ? { start: data.start_date, end: data.end_date } : null
}

// Nº de excepciones de AUTOSERVICIO aceptadas del estudiante en el semestre vigente
// (fallback: últimos 120 días si no hay semestre que contenga hoy).
export async function selfServiceUsedThisSemester(sb: SB, studentId: string): Promise<number> {
  const sem = await currentSemesterRange(sb)
  const from = sem ? sem.start : new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
  let q = sb.from('moodle_exception_requests').select('id', { count: 'exact', head: true })
    .eq('student_id', studentId).eq('decision', 'aceptada').gte('created_at', from)
  if (sem) q = q.lte('created_at', sem.end + 'T23:59:59')
  const { count } = await q
  return count ?? 0
}

// Plan de acceso: qué estudiantes deberían quedar suspendidos (vencido>0 y sin
// excepción vigente) vs. su estado actual. Incluye también a los ya suspendidos
// para detectar quién debe REACTIVARSE (pagó o recibió excepción).
export async function planAccess(sb: SB): Promise<AccessRow[]> {
  const [over, exc] = await Promise.all([overdueByStudent(sb), activeExceptionMap(sb)])
  const { data: suspended } = await sb.from('academic_students').select('id').eq('moodle_suspended', true)

  // Retiro involuntario vigente → campus cerrado (Dirección, 17-08-2026).
  //
  // Hasta hoy este motor solo miraba deuda, así que un retirado que no debía
  // nada conservaba el aula abierta: 111 de los 191 IW con cuenta la tenían
  // activa, y 42 habían entrado DESPUÉS de su retiro. El motor funcionaba —
  // para lo que se diseñó, que es cobrar. Ejecutar un retiro nunca estuvo en
  // su fórmula.
  //
  // El IW no cierra el correo ni el portal del estudiante: solo el campus.
  const { data: retiros } = await sb.from('student_withdrawals')
    .select('student_id').eq('type', 'IW').eq('status', 'vigente')
  const iwVigente = new Set<string>((retiros ?? []).map((w: { student_id: string }) => String(w.student_id)))

  const ids = new Set<string>([
    ...over.keys(),
    ...iwVigente,
    ...((suspended ?? []).map((s: { id: string }) => s.id)),
  ])
  if (!ids.size) return []

  const idArr = [...ids]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info = new Map<string, any>()
  for (let i = 0; i < idArr.length; i += 300) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, email, email_alt, external_id, moodle_user_id, moodle_suspended, situation')
      .in('id', idArr.slice(i, i + 300))
    for (const s of data ?? []) info.set(s.id, s)
  }

  // "Sin cuenta Moodle" (columna opcional): tolerante si la migración aún no corrió.
  const noAccountSet = new Set<string>()
  try {
    const { data } = await sb.from('academic_students').select('id').in('id', idArr).eq('moodle_no_account', true)
    for (const s of data ?? []) noAccountSet.add(s.id)
  } catch { /* columna moodle_no_account inexistente todavía */ }

  // El estado actual se lee del CAMPUS, no de nuestra propia anotación.
  //
  // moodle_suspended guarda lo que el ERP cree haber hecho, y el 26/07 esa
  // creencia se separó de la realidad en 59 cuentas: el motor las daba por
  // cerradas y por eso calculaba acción 'ninguna', así que no volvía a
  // intentarlo nunca. Preguntándole a Moodle, cualquier desvío —una llamada
  // que no aplicó, una reactivación manual— se corrige en la corrida siguiente
  // en vez de durar para siempre.
  const idsMoodle = idArr.map(id => Number(info.get(id)?.moodle_user_id)).filter(n => Number.isFinite(n) && n > 0)
  let realEnMoodle = new Map<number, boolean>()
  if (moodleConfigured() && idsMoodle.length) {
    try { realEnMoodle = await suspendedByMoodleIds(idsMoodle) }
    catch { /* si el campus no responde, se cae a la anotación local */ }
  }

  // Y de paso se corrige la creencia del ERP.
  //
  // Antes solo se escribía moodle_suspended al ACTUAR. Si el campus ya decía lo
  // que queríamos, la acción era 'ninguna' y la anotación se quedaba como
  // estaba: cuentas cerradas en Moodle que aquí figuraban abiertas durante
  // meses. Se vio el 17-08, cuando el plan pedía suspender 245 y la anotación
  // local decía 175 — y al revés, dos cuentas ya cerradas que aquí seguían en
  // "activa". Otras pantallas leen esta columna, así que dejarla mintiendo
  // barato no sale gratis.
  const aCorregir: { id: string; v: boolean }[] = []
  for (const id of idArr) {
    const s = info.get(id)
    const real = s ? realEnMoodle.get(Number(s.moodle_user_id)) : undefined
    if (real !== undefined && real !== !!s.moodle_suspended) aCorregir.push({ id, v: real })
  }
  for (const v of [true, false]) {
    const lote = aCorregir.filter(x => x.v === v).map(x => x.id)
    for (let i = 0; i < lote.length; i += 200) {
      try { await sb.from('academic_students').update({ moodle_suspended: v }).in('id', lote.slice(i, i + 200)) }
      catch { /* la corrección es cortesía; el plan se calcula igual */ }
    }
  }

  const rows: AccessRow[] = []
  for (const id of idArr) {
    const s = info.get(id); if (!s) continue
    const overdue = over.get(id) ?? 0
    const ex = exc.get(id)
    const hasExc = !!ex
    const noAccount = noAccountSet.has(id)
    // La verdad del campus manda; la anotación local es sólo el respaldo.
    const enMoodle = realEnMoodle.get(Number(s.moodle_user_id))
    const cur = enMoodle ?? !!s.moodle_suspended
    // Campus externo (aliados): NO usan nuestro Moodle → fuera de la restricción.
    // Si no está suspendido, ni lo listamos; si por error lo está, se reactiva.
    const isPartner = s.situation === 'campus_socio'
    if (isPartner && !cur) continue
    // Sin cuenta Moodle o campus externo → nunca 'suspend'
    //
    // El IW manda por encima de la excepción: la excepción es un permiso de
    // días para que un DEUDOR termine algo, y un retirado no está terminando
    // nada. Y manda por encima de la deuda en los dos sentidos — es lo que
    // impide que pagar, o que le anulen las cuotas, le devuelva el aula. Sin
    // esto, anular las cuotas de lo no consumido —el paso natural tras la
    // liquidación— habría reabierto el campus a 79 retirados a la mañana
    // siguiente, porque 'unsuspend' salta en cuanto la deuda llega a cero.
    const esIW = iwVigente.has(id)
    const desired = (esIW || (overdue > 0.005 && !hasExc)) && !noAccount && !isPartner
    const action: AccessRow['action'] = desired && !cur ? 'suspend' : (!desired && cur ? 'unsuspend' : 'none')
    rows.push({
      student_id: id, name: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '),
      document: s.document_number, email: s.email, email_alt: s.email_alt ?? null,
      external_id: s.external_id, moodle_user_id: s.moodle_user_id ?? null, no_account: noAccount,
      overdue: Math.round(overdue * 100) / 100, iw: esIW, has_exception: hasExc, exception_id: ex?.id ?? null,
      exception_expires: ex?.expires_at ?? null, exception_source: ex?.source ?? null, exception_justification: ex?.justification ?? null,
      currently_suspended: cur, desired_suspended: desired, action,
    })
  }
  rows.sort((a, b) => b.overdue - a.overdue)
  return rows
}

// Aplica en Moodle los cambios de suspensión y cachea el estado. Best-effort por
// estudiante: un error en uno no detiene el resto.
export async function applyAccess(sb: SB, rows: AccessRow[]): Promise<{ suspended: number; unsuspended: number; errors: string[] }> {
  const errors: string[] = []; let suspended = 0, unsuspended = 0
  for (const r of rows.filter(x => x.action !== 'none')) {
    try {
      const uid = r.moodle_user_id ?? await resolveMoodleUserId(r.external_id, r.email_alt, r.email)
      if (!uid) { errors.push(`${r.name}: sin cuenta en Moodle`); continue }
      const suspend = r.action === 'suspend'
      await setUserSuspended(uid, suspend)
      await sb.from('academic_students').update({
        moodle_suspended: suspend, moodle_suspended_at: suspend ? new Date().toISOString() : null,
      }).eq('id', r.student_id)
      if (suspend) suspended++; else unsuspended++
    } catch (e) { errors.push(`${r.name}: ${String(e)}`) }
  }
  return { suspended, unsuspended, errors }
}

// Reactiva de inmediato la cuenta Moodle de un estudiante (al otorgar excepción o
// registrar pago). No falla si no tiene cuenta.
export async function unsuspendStudent(sb: SB, studentId: string): Promise<void> {
  const { data: s } = await sb.from('academic_students')
    .select('external_id, email, email_alt, moodle_user_id, moodle_suspended').eq('id', studentId).maybeSingle()
  if (!s?.moodle_suspended) return
  const uid = s.moodle_user_id ?? await resolveMoodleUserId(s.external_id, s.email_alt, s.email).catch(() => null)
  if (uid) await setUserSuspended(uid, false).catch(() => null)
  await sb.from('academic_students').update({ moodle_suspended: false, moodle_suspended_at: null }).eq('id', studentId)
}

// Vencido de UN estudiante (consulta ligera, para reconciliar tras un pago).
export async function overdueForStudent(sb: SB, studentId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: charges } = await sb.from('account_charges')
    .select('external_id, amount, due_date').eq('student_id', studentId).not('due_date', 'is', null).lte('due_date', today)
  if (!charges?.length) return 0
  const extIds = charges.map((c: { external_id: string }) => c.external_id)
  const paid = new Map<string, number>()
  for (let i = 0; i < extIds.length; i += 300) {
    const { data } = await sb.from('account_payments').select('charge_external_id, amount').in('charge_external_id', extIds.slice(i, i + 300))
    for (const p of data ?? []) paid.set(p.charge_external_id, (paid.get(p.charge_external_id) ?? 0) + Number(p.amount || 0))
  }
  let over = 0
  for (const c of charges) { const bal = Number(c.amount || 0) - (paid.get(c.external_id) ?? 0); if (bal > 0.005) over += bal }
  return Math.round(over * 100) / 100
}

// Reconcilia el acceso de UN estudiante (suspende/reactiva según su vencido y
// excepción vigente). Idempotente: no llama a Moodle si el estado ya es el correcto.
export async function refreshStudentAccess(sb: SB, studentId: string): Promise<void> {
  if (!moodleConfigured()) return
  const { data: s } = await sb.from('academic_students')
    .select('external_id, email, email_alt, moodle_user_id, moodle_suspended, situation').eq('id', studentId).maybeSingle()
  if (!s) return
  const isPartner = s.situation === 'campus_socio'
  const now = new Date().toISOString()
  const { data: exc } = await sb.from('moodle_access_exceptions').select('id').eq('student_id', studentId).gt('expires_at', now).limit(1)
  const hasExc = (exc?.length ?? 0) > 0
  const overdue = (hasExc || isPartner) ? 0 : await overdueForStudent(sb, studentId)
  // Campus externo nunca se suspende por deuda
  const desired = overdue > 0.005 && !hasExc && !isPartner
  if (desired === !!s.moodle_suspended) return
  const uid = s.moodle_user_id ?? await resolveMoodleUserId(s.external_id, s.email_alt, s.email).catch(() => null)
  if (uid) await setUserSuspended(uid, desired).catch(() => null)
  await sb.from('academic_students').update({ moodle_suspended: desired, moodle_suspended_at: desired ? now : null }).eq('id', studentId)
}

export interface LinkResult {
  student_id: string; name: string; email: string | null
  status: 'vinculado' | 'candidato' | 'ambiguo' | 'sin_cuenta'
  moodle_user_id?: number | null; moodle_email?: string | null; matches?: number
}

// Diagnóstico de vinculación: para los estudiantes en deuda AÚN sin suspender y
// sin moodle_user_id cacheado, intenta localizar su cuenta Moodle.
//  - Llave fiable (idnumber/institucional/personal) → cachea moodle_user_id (vinculado).
//  - Búsqueda por nombre → candidato (1 match) / ambiguo (varios), para revisar a mano.
//  - Nada → sin_cuenta.
// `soloEstos` acota el diagnóstico a una lista concreta. Sin él mira a los
// deudores, que es para lo que nació —el motor de accesos necesita saber a
// quién puede suspender—. Pero la pregunta "¿este retirado sigue entrando al
// campus?" es de otra población: 344 de los 352 IW vigentes no tienen el
// moodle_user_id guardado, y sin él no hay a quién preguntarle el último
// acceso. Es el mismo trabajo, sobre otra lista.
export async function diagnoseLinks(sb: SB, soloEstos?: string[]): Promise<{ rows: LinkResult[]; name_search: boolean }> {
  let ids: string[]
  if (soloEstos) ids = [...new Set(soloEstos)]
  else {
    const over = await overdueByStudent(sb)
    ids = [...over.keys()]
  }
  if (!ids.length) return { rows: [], name_search: true }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, email, email_alt, external_id, moodle_user_id, moodle_suspended, situation')
      .in('id', ids.slice(i, i + 300))
    for (const s of data ?? []) info.set(s.id, s)
  }
  // Campus externo no usa nuestro Moodle → no se diagnostica.
  //
  // El filtro !moodle_suspended solo aplica al caso de los deudores: allí una
  // cuenta ya suspendida no necesita vincularse porque no hay nada que hacerle.
  // Cuando se pide una lista concreta la pregunta es otra —quién es este
  // estudiante en Moodle— y suspendido o no da igual.
  const targets = ids.map(id => info.get(id))
    .filter(s => s && !s.moodle_user_id && s.situation !== 'campus_socio' && (soloEstos || !s.moodle_suspended))
  // Actualización tolerante (columna moodle_no_account opcional)
  const setNoAccount = async (id: string, v: boolean) => { try { await sb.from('academic_students').update({ moodle_no_account: v }).eq('id', id) } catch { /* sin columna */ } }

  const rows: LinkResult[] = []
  let nameSearch = true
  for (const s of targets) {
    const name = [s.first_name, s.last_name].filter(Boolean).join(' ')
    const uid = await resolveMoodleUserId(s.external_id, s.email_alt, s.email).catch(() => null)
    if (uid) {
      await sb.from('academic_students').update({ moodle_user_id: uid }).eq('id', s.id)
      await setNoAccount(s.id, false)
      rows.push({ student_id: s.id, name, email: s.email, status: 'vinculado', moodle_user_id: uid })
      continue
    }
    if (nameSearch && s.first_name && s.last_name) {
      const found = await findMoodleUsersByName(s.first_name, s.last_name)
      if (found === null) { nameSearch = false }
      else if (found.length === 1) { await setNoAccount(s.id, false); rows.push({ student_id: s.id, name, email: s.email, status: 'candidato', moodle_user_id: found[0].id, moodle_email: found[0].email }); continue }
      else if (found.length > 1) { await setNoAccount(s.id, false); rows.push({ student_id: s.id, name, email: s.email, status: 'ambiguo', matches: found.length }); continue }
    }
    // Confirmado sin cuenta (ni por llave ni por nombre) → se excluye del plan
    await setNoAccount(s.id, true)
    rows.push({ student_id: s.id, name, email: s.email, status: 'sin_cuenta' })
  }
  return { rows, name_search: nameSearch }
}

// Confirma un candidato: cachea el moodle_user_id elegido a mano.
export async function linkStudent(sb: SB, studentId: string, moodleUserId: number): Promise<void> {
  await sb.from('academic_students').update({ moodle_user_id: moodleUserId, moodle_no_account: false }).eq('id', studentId)
}

// Tras registrar pagos: reactiva a los estudiantes que estaban SUSPENDIDOS y ya
// quedaron sin vencido. Solo mira a los suspendidos → mínimas llamadas a Moodle.
export async function refreshAccessForStudents(sb: SB, studentIds: string[]): Promise<number> {
  if (!moodleConfigured() || !studentIds.length) return 0
  const uniq = [...new Set(studentIds.filter(Boolean))]
  let done = 0
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await sb.from('academic_students').select('id').in('id', uniq.slice(i, i + 300)).eq('moodle_suspended', true)
    for (const s of data ?? []) { try { await refreshStudentAccess(sb, s.id); done++ } catch { /* best-effort */ } }
  }
  return done
}
