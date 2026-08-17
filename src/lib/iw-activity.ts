import { moodleUserState, moodleConfigured } from './moodle'
import { lastLoginByEmail } from './google-workspace'

// ---------------------------------------------------------------------------
// ¿Son efectivos los retiros involuntarios?
//
// Hasta ahora "IW vigente" significaba una sola cosa: existe un retiro y no
// existe una reincorporación. Es un supuesto DOCUMENTAL —lo que dicen los
// papeles— y nadie lo había contrastado contra la conducta del estudiante.
//
// Un IW dice que el estudiante dejó de participar. Si sigue entrando al campus
// o al correo institucional meses después, una de dos: el retiro no se ejecutó
// de verdad, o se revirtió sin dejar rastro. En cualquiera de los dos casos
// alguien está usando servicios que la institución cree haber cerrado, y la
// liquidación de lo consumido se calculó sobre una foto falsa.
//
// Dos señales, ninguna opinable:
//   · Moodle  → lastaccess del usuario (0 = nunca entró)
//   · Correo  → lastLoginTime del directorio de Google
//
// Las dos se consultan en vivo y solo corren donde están las credenciales. Si
// una falta, su columna dice "sin dato" en vez de inventar un cero: no saber y
// no haber entrado son cosas distintas.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export type Veredicto =
  | 'coherente'        // el último acceso es anterior al retiro
  | 'nunca_entro'      // jamás usó ni campus ni correo
  | 'activo_despues'   // entró DESPUÉS del retiro
  | 'sin_dato'         // no hay forma de saberlo

export interface CasoIW {
  student_id: string
  nombre: string
  documento: string | null
  retiro: string | null
  origen: string
  moodle_ultimo: string | null
  moodle_suspendido: boolean | null
  correo_ultimo: string | null
  dias_desde_el_ultimo_acceso: number | null
  veredicto: Veredicto
}

export interface ResumenIW {
  vigentes: number
  con_cuenta_moodle: number
  con_correo: number
  moodle_disponible: boolean
  correo_disponible: boolean
  por_veredicto: Record<Veredicto, number>
  activos_ultimos_30_dias: number
  activos_despues_sin_suspender: number
  casos: CasoIW[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: SB, tabla: string, cols: string, orden: string): Promise<any[]> {
  const out: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).order(orden).range(from, from + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return out as any[]
}

export async function auditarActividadIW(sb: SB): Promise<ResumenIW> {
  const [wds, est] = await Promise.all([
    todo(sb, 'student_withdrawals', 'student_id, type, status, withdrawal_date, source', 'student_id'),
    todo(sb, 'academic_students', 'id, first_name, last_name, second_last_name, document_number, email, email_alt, moodle_user_id, moodle_suspended', 'id'),
  ])

  // El retiro que manda es el MÁS RECIENTE: un estudiante puede acumular
  // varios, y el último es el que define desde cuándo no debería participar.
  const vigentes = wds.filter(w => w.type === 'IW' && w.status === 'vigente')
  const retiroDe = new Map<string, { fecha: string | null; origen: string }>()
  for (const w of vigentes) {
    const s = String(w.student_id)
    const f = w.withdrawal_date ? String(w.withdrawal_date).slice(0, 10) : null
    const prev = retiroDe.get(s)
    if (!prev || (f && prev.fecha && f > prev.fecha) || (f && !prev.fecha)) {
      retiroDe.set(s, { fecha: f, origen: String(w.source) })
    }
  }

  const info = new Map(est.map(e => [String(e.id), e]))
  const ids = [...retiroDe.keys()]
    .map(s => Number(info.get(s)?.moodle_user_id))
    .filter(n => Number.isFinite(n) && n > 0)

  const [estadoMoodle, loginCorreo] = await Promise.all([
    moodleConfigured() ? moodleUserState(ids) : Promise.resolve(new Map<number, { suspended: boolean; lastaccess: number }>()),
    lastLoginByEmail(),
  ])
  const moodleOk = moodleConfigured() && estadoMoodle.size > 0
  const correoOk = loginCorreo.size > 0

  const hoy = Date.now()
  const casos: CasoIW[] = []
  for (const [sid, retiro] of retiroDe) {
    const e = info.get(sid)
    if (!e) continue
    const uid = Number(e.moodle_user_id)
    const m = Number.isFinite(uid) && uid > 0 ? estadoMoodle.get(uid) : undefined
    const mUlt = m && m.lastaccess > 0 ? new Date(m.lastaccess * 1000).toISOString().slice(0, 10) : null
    // El correo institucional puede estar en email o en email_alt.
    const correos = [e.email, e.email_alt].filter(Boolean).map((x: string) => String(x).toLowerCase())
    let cUlt: string | null = null
    for (const c of correos) {
      const v = loginCorreo.get(c)
      if (v && (!cUlt || v > cUlt)) cUlt = v
    }
    const cDia = cUlt ? cUlt.slice(0, 10) : null

    const ultimo = [mUlt, cDia].filter(Boolean).sort().pop() ?? null
    const sabemos = (moodleOk && m !== undefined) || (correoOk && correos.length > 0)
    const veredicto: Veredicto = !sabemos ? 'sin_dato'
      : !ultimo ? 'nunca_entro'
      : retiro.fecha && ultimo > retiro.fecha ? 'activo_despues'
      : 'coherente'

    casos.push({
      student_id: sid,
      nombre: [e.first_name, e.last_name, e.second_last_name].filter(Boolean).join(' '),
      documento: e.document_number ?? null,
      retiro: retiro.fecha,
      origen: retiro.origen,
      moodle_ultimo: mUlt,
      moodle_suspendido: m ? m.suspended : null,
      correo_ultimo: cDia,
      dias_desde_el_ultimo_acceso: ultimo ? Math.round((hoy - Date.parse(ultimo)) / 86400000) : null,
      veredicto,
    })
  }

  const por: Record<Veredicto, number> = { coherente: 0, nunca_entro: 0, activo_despues: 0, sin_dato: 0 }
  for (const c of casos) por[c.veredicto]++

  return {
    vigentes: retiroDe.size,
    con_cuenta_moodle: ids.length,
    con_correo: casos.filter(c => c.correo_ultimo !== null).length,
    moodle_disponible: moodleOk,
    correo_disponible: correoOk,
    por_veredicto: por,
    activos_ultimos_30_dias: casos.filter(c => c.veredicto === 'activo_despues' && (c.dias_desde_el_ultimo_acceso ?? 999) <= 30).length,
    // El caso más grave: entró después del retiro Y su cuenta sigue abierta.
    activos_despues_sin_suspender: casos.filter(c => c.veredicto === 'activo_despues' && c.moodle_suspendido === false).length,
    casos: casos.sort((a, b) => (a.dias_desde_el_ultimo_acceso ?? 99999) - (b.dias_desde_el_ultimo_acceso ?? 99999)),
  }
}
