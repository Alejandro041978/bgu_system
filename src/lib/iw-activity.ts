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

// Cada señal se juzga POR SEPARADO y con las mismas tres cajas. Un estudiante
// puede no tener cuenta de campus y sí de correo; fundir las dos en un
// veredicto único obligaba a decidir cuál manda y escondía de cuál venía el
// dato. Separadas, cada bloque cuadra solo y se puede comprobar de un vistazo:
//
//     antes + después + nunca = con cuenta
//
// Esa suma es la que hace auditable el reporte. Si no cierra, hay un caso
// clasificado dos veces o ninguna.
export type Veredicto = 'antes' | 'despues' | 'nunca' | 'sin_cuenta'

export interface BloqueSenal {
  con_cuenta: number   // tiene una cuenta que se pueda consultar
  antes: number        // su último acceso es anterior al retiro
  despues: number      // entró DESPUÉS del retiro
  nunca: number        // la cuenta existe y jamás se usó
  sin_cuenta: number   // no hay nada que mirar
  disponible: boolean  // ¿respondió el sistema? si no, el bloque no dice nada
}

export interface CasoIW {
  student_id: string
  nombre: string
  documento: string | null
  retiro: string | null
  origen: string
  moodle_ultimo: string | null
  moodle_suspendido: boolean | null
  moodle_veredicto: Veredicto
  correo_ultimo: string | null
  correo_veredicto: Veredicto
  dias_desde_el_ultimo_acceso: number | null
}

export interface ResumenIW {
  vigentes: number
  campus: BloqueSenal
  correo: BloqueSenal
  // Entró después del retiro por CUALQUIERA de las dos vías.
  activos_despues: number
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
    // OJO: el mapa de Google trae null cuando la cuenta EXISTE y nunca se usó,
    // y no trae la clave cuando NO HAY cuenta. Confundir las dos convertía a
    // 119 estudiantes sin correo institucional en "nunca entró", que es
    // exactamente la mentira que este contraste tenía que evitar.
    const tieneCuenta = correos.some(c => loginCorreo.has(c))
    let cUlt: string | null = null
    for (const c of correos) {
      const v = loginCorreo.get(c)
      if (v && (!cUlt || v > cUlt)) cUlt = v
    }
    const cDia = cUlt ? cUlt.slice(0, 10) : null

    // Un veredicto por señal, con la misma regla en las dos.
    const juzgar = (hayCuenta: boolean, ultimo: string | null): Veredicto =>
      !hayCuenta ? 'sin_cuenta'
        : !ultimo ? 'nunca'
        : retiro.fecha && ultimo > retiro.fecha ? 'despues'
        : 'antes'

    const vCampus = juzgar(moodleOk && m !== undefined, mUlt)
    const vCorreo = juzgar(correoOk && tieneCuenta, cDia)
    const ultimo = [mUlt, cDia].filter(Boolean).sort().pop() ?? null

    casos.push({
      student_id: sid,
      nombre: [e.first_name, e.last_name, e.second_last_name].filter(Boolean).join(' '),
      documento: e.document_number ?? null,
      retiro: retiro.fecha,
      origen: retiro.origen,
      moodle_ultimo: mUlt,
      moodle_suspendido: m ? m.suspended : null,
      moodle_veredicto: vCampus,
      correo_ultimo: cDia,
      correo_veredicto: vCorreo,
      dias_desde_el_ultimo_acceso: ultimo ? Math.round((hoy - Date.parse(ultimo)) / 86400000) : null,
    })
  }

  const bloque = (lee: (c: CasoIW) => Veredicto, disponible: boolean): BloqueSenal => {
    const n = (v: Veredicto) => casos.filter(c => lee(c) === v).length
    const antes = n('antes'), despues = n('despues'), nunca = n('nunca')
    return { con_cuenta: antes + despues + nunca, antes, despues, nunca, sin_cuenta: n('sin_cuenta'), disponible }
  }
  const activo = (c: CasoIW) => c.moodle_veredicto === 'despues' || c.correo_veredicto === 'despues'

  return {
    vigentes: retiroDe.size,
    campus: bloque(c => c.moodle_veredicto, moodleOk),
    correo: bloque(c => c.correo_veredicto, correoOk),
    activos_despues: casos.filter(activo).length,
    activos_ultimos_30_dias: casos.filter(c => activo(c) && (c.dias_desde_el_ultimo_acceso ?? 999) <= 30).length,
    // El caso más grave: entró al CAMPUS después del retiro y su cuenta sigue
    // abierta. Ir al campus es ir a clase; el correo se mira por inercia.
    activos_despues_sin_suspender: casos.filter(c => c.moodle_veredicto === 'despues' && c.moodle_suspendido === false).length,
    casos: casos.sort((a, b) => (a.dias_desde_el_ultimo_acceso ?? 99999) - (b.dias_desde_el_ultimo_acceso ?? 99999)),
  }
}
