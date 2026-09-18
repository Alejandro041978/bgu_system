import { nextResolutionNumber, recomputeSituations } from './withdrawals'
import { overdueByStudent } from './moodle-access'
import { notificarEstudiante, plantillaIWAutomatico, plantillaPreavisoIW } from './student-notifications'

// ---------------------------------------------------------------------------
// IW AUTOMÁTICO por abandono (regla del usuario, 18/09/2026).
//
// Un estudiante que NO tramitó un LOA, lleva 35 días sin conectarse (ni al
// campus ni al ERP), tiene DEUDA VENCIDA y no le contesta a Camila, pasa a
// Retiro Institucional. Las cuatro condiciones a la vez, por matrícula:
//
//   1. Matrícula activa, sin LOA/IW vigente ni solicitud de retiro abierta, y
//      con 35+ días desde su activación (a quien nunca entró se le cuenta desde
//      ahí).
//   2. 35 días sin conexión: la última entre campus (Moodle) y ERP.
//   3. Deuda VENCIDA de tuition (mismo criterio que suspende el campus) — no
//      el saldo, que incluye cuotas futuras.
//   4. Camila le escribió DENTRO del periodo de desconexión (2+ mensajes
//      entregados de las campañas Ausente o Cobranza —campaign_contacts—, el
//      último hace 7+ días) y no respondió. Si Camila nunca le
//      escribió NO hay IW: lo justo es contactarlo primero.
//
// Día 28: preaviso al estudiante. Día 35 (y 7+ días después del preaviso): IW.
//
// El IW automático NO liquida nada: nace 'vigente' y entra, como todo IW, a la
// cola del Gestor IW · Re-Entry, donde una persona revisa y aprueba su
// ejecución (asignaturas, tuition, cuotas).
//
// Interruptor (auto_iw_settings.enabled): apagado = "modo ensayo" — el proceso
// calcula todo y la pantalla lo muestra, pero no envía preavisos ni crea IW.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export const DIAS_IW = 35
export const DIAS_PREAVISO = 28
const DIAS_TRAS_PREAVISO = 7
const MIN_CONTACTOS_CAMILA = 2
const DIAS_SIN_RESPUESTA = 7
const DAY = 86_400_000

export type EstadoAutoIW =
  | 'cumple'              // las cuatro condiciones + preaviso cumplido → IW
  | 'esperando_preaviso'  // cumple todo, pero el preaviso aún no tiene 7 días (o no se envió)
  | 'en_preaviso'         // día 28–34 con deuda vencida: toca (o ya se envió) el preaviso
  | 'falta_camila'        // 35+ días y deuda vencida, pero Camila no lo ha contactado lo suficiente
  | 'revision_manual'     // varias matrículas activas, no contactar, conversando o con compromiso

export interface CandidatoAutoIW {
  student_id: string; enrollment_id: string | null
  estudiante: string; documento: string | null; programa: string
  dias_sin_conexion: number; ultima_conexion: string | null; nunca_conecto: boolean
  deuda_vencida: number
  camila: { contactos: number; ultimo_contacto: string | null; respondio: boolean; resultado: string | null }
  preaviso_enviado: string | null
  estado: EstadoAutoIW
  motivo: string
}

export interface AutoIWSettings { enabled: boolean; daily_cap: number; migrado: boolean }

export async function leerSettings(sb: SB): Promise<AutoIWSettings> {
  const r = await sb.from('auto_iw_settings').select('enabled, daily_cap').eq('id', 1).maybeSingle()
  if (r.error) return { enabled: false, daily_cap: 10, migrado: false }
  return { enabled: !!r.data?.enabled, daily_cap: Number(r.data?.daily_cap ?? 10), migrado: true }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: SB, t: string, cols: string, f?: (q: any) => any, orden: string[] = ['id']): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let d = 0; ; d += 1000) {
    let q = sb.from(t).select(cols)
    if (f) q = f(q)
    for (const o of orden) q = q.order(o)
    const { data, error } = await q.range(d, d + 999)
    if (error) throw new Error(`${t}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

export async function evaluarAutoIW(sb: SB): Promise<{ candidatos: CandidatoAutoIW[]; resumen: Record<EstadoAutoIW, number>; excluidos: Record<string, number> }> {
  const ahora = Date.now()
  const hoy = new Date().toISOString().slice(0, 10)
  const [students, enrs, progs, retiros, solicitudes, vencido, contactos, avisos, miembros, cursando] = await Promise.all([
    todo(sb, 'academic_students', 'id, first_name, last_name, second_last_name, document_number, situation'),
    todo(sb, 'academic_student_enrollments', 'id, student_id, program_id, status, activated_at, enrollment_date'),
    todo(sb, 'academic_programs', 'id, name, partner_campus'),
    todo(sb, 'student_withdrawals', 'id, student_id, enrollment_id, type, status', q => q.eq('status', 'vigente')),
    // Tolerante: si la tabla de solicitudes no existe o cambia, no tumba la evaluación
    todo(sb, 'withdrawal_requests', 'id, student_id, status').catch(() => []),
    overdueByStudent(sb),
    // La bitácora de Camila es campaign_contacts (motor de campañas). El motor
    // viejo de retención se fusionó el 10/09/2026: retention_contacts y
    // retention_settings son restos y NO se leen. Cuentan las dos campañas que
    // le escriben a un activo desconectado: 'ausente' (sin deuda vencida) y
    // 'cobranza' (con deuda vencida — a donde el resolutor manda al deudor).
    todo(sb, 'campaign_contacts', 'id, student_id, campaign_key, sent_at, status, replied_at, outcome_at', q => q.in('campaign_key', ['ausente', 'cobranza'])),
    todo(sb, 'student_notifications', 'id, student_id, kind, created_at', q => q.eq('kind', 'iw_preaviso')).catch(() => []),
    todo(sb, 'academic_group_students', 'student_id, group_id, status', q => q.eq('status', 'activo'), ['student_id', 'group_id']),
    todo(sb, 'academic_course_enrollments', 'id, student_id, status', q => q.in('status', ['en_curso', 'no_iniciada'])),
  ])
  // student_tracking tiene PK student_id (sin id): lectura aparte
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tracking: any[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from('student_tracking')
      .select('student_id, last_erp_login, last_moodle_access, last_outcome, last_outcome_at, commitment_date, do_not_contact')
      .order('student_id').range(d, d + 999)
    if (error) throw new Error('student_tracking: ' + error.message)
    tracking.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trDe = new Map<string, any>(tracking.map(t => [String(t.student_id), t]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progDe = new Map<string, any>(progs.map(p => [String(p.id), p]))
  const conRetiro = new Set<string>(retiros.map(r => String(r.enrollment_id ?? r.student_id)))
  const retiroDeEstudiante = new Set<string>(retiros.map(r => String(r.student_id)))
  const conSolicitud = new Set<string>(solicitudes
    .filter(s => ['pendiente', 'en_revision', 'en_proceso', 'solicitada'].includes(String(s.status ?? '')))
    .map(s => String(s.student_id)))
  const enCarrusel = new Set<string>(miembros.map(m => String(m.student_id)))
  const conAsignaturasAbiertas = new Set<string>(cursando.map(c => String(c.student_id)))
  const contactosDe = new Map<string, { sent_at: string; replied_at: string | null }[]>()
  for (const c of contactos) {
    if (c.status !== 'sent' || !c.sent_at) continue
    const k = String(c.student_id)
    const resp = c.replied_at ?? c.outcome_at ?? null
    contactosDe.set(k, [...(contactosDe.get(k) ?? []), { sent_at: String(c.sent_at), replied_at: resp ? String(resp) : null }])
  }
  const preavisoDe = new Map<string, string>()
  for (const a of avisos) {
    const k = String(a.student_id), f = String(a.created_at)
    if (!preavisoDe.has(k) || f > preavisoDe.get(k)!) preavisoDe.set(k, f)
  }

  const vivasDe = new Map<string, typeof enrs>()
  for (const e of enrs) {
    // Viva = estado 'activa'. NO se exige activated_at: 1.999 matrículas heredadas
    // de SystemActiva están activas sin ese sello (solo lo tienen las nativas).
    // 'pendiente_pago' no entra: quien nunca pagó no abandonó, nunca empezó.
    if (String(e.status ?? '') !== 'activa') continue
    if (conRetiro.has(String(e.id))) continue
    const k = String(e.student_id)
    vivasDe.set(k, [...(vivasDe.get(k) ?? []), e])
  }

  const excluidos: Record<string, number> = {}
  const excluir = (m: string) => { excluidos[m] = (excluidos[m] ?? 0) + 1 }
  const candidatos: CandidatoAutoIW[] = []

  for (const s of students) {
    const sid = String(s.id)
    if (s.situation !== 'activo') continue
    const vivas = vivasDe.get(sid) ?? []
    if (!vivas.length) continue
    const deuda = Math.round((vencido.get(sid) ?? 0) * 100) / 100
    const t = trDe.get(sid)
    const ultimaMs = Math.max(
      t?.last_moodle_access ? new Date(t.last_moodle_access).getTime() : 0,
      t?.last_erp_login ? new Date(t.last_erp_login).getTime() : 0)
    const nunca = ultimaMs === 0
    // A quien nunca entró se le cuenta desde su activación más reciente
    const inicioDe = (e: { activated_at: string | null; enrollment_date: string | null }) => new Date(String(e.activated_at ?? e.enrollment_date ?? '2000-01-01')).getTime()
    const desdeMs = nunca ? Math.max(...vivas.map(inicioDe)) : ultimaMs
    const dias = Math.floor((ahora - desdeMs) / DAY)
    if (dias < DIAS_PREAVISO) continue
    if (deuda <= 0.005) { excluir('sin deuda vencida'); continue }
    if (retiroDeEstudiante.has(sid) && vivas.length === 0) continue
    if (conSolicitud.has(sid)) { excluir('solicitud de retiro en trámite'); continue }
    if (vivas.every(e => progDe.get(String(e.program_id))?.partner_campus)) { excluir('campus socio (sin dato de conexión)'); continue }
    if (!enCarrusel.has(sid)) { excluir('sin carrusel activo (en espera de su siguiente cadena)'); continue }
    if (!conAsignaturasAbiertas.has(sid)) { excluir('sin asignaturas por cursar (espera de grado)'); continue }

    const cs = (contactosDe.get(sid) ?? []).filter(c => new Date(c.sent_at).getTime() >= desdeMs).sort((a, b) => a.sent_at.localeCompare(b.sent_at))
    const ultimoContacto = cs.length ? cs[cs.length - 1].sent_at : null
    const respondio = cs.some(c => !!c.replied_at)
      || (!!t?.last_outcome_at && new Date(t.last_outcome_at).getTime() >= desdeMs)
    const camila = { contactos: cs.length, ultimo_contacto: ultimoContacto, respondio, resultado: t?.last_outcome ?? null }
    const preaviso = preavisoDe.get(sid) ?? null
    const preavisoVigente = preaviso && new Date(preaviso).getTime() >= desdeMs ? preaviso : null

    const e = vivas[0]
    const base = {
      student_id: sid, enrollment_id: vivas.length === 1 ? String(e.id) : null,
      estudiante: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '),
      documento: s.document_number ?? null,
      programa: vivas.map(x => progDe.get(String(x.program_id))?.name ?? '—').join(' + '),
      dias_sin_conexion: dias, ultima_conexion: nunca ? null : new Date(ultimaMs).toISOString(), nunca_conecto: nunca,
      deuda_vencida: deuda, camila, preaviso_enviado: preavisoVigente,
    }

    let estado: EstadoAutoIW, motivo: string
    const compromisoVigente = t?.commitment_date && String(t.commitment_date).slice(0, 10) >= hoy
    if (vivas.length > 1) { estado = 'revision_manual'; motivo = 'Tiene más de una matrícula activa: decidir a mano de cuál se retira.' }
    else if (t?.do_not_contact) { estado = 'revision_manual'; motivo = 'Pidió no ser contactado: Camila no puede escribirle.' }
    else if (respondio || compromisoVigente) { estado = 'revision_manual'; motivo = compromisoVigente ? 'Tiene un compromiso vigente con Camila.' : 'Respondió a Camila durante la desconexión.' }
    else if (dias < DIAS_IW) { estado = 'en_preaviso'; motivo = preavisoVigente ? 'Preaviso enviado; se cumple el plazo al día 35.' : 'Le toca el preaviso del día 28.' }
    else if (cs.length < MIN_CONTACTOS_CAMILA || !ultimoContacto || (ahora - new Date(ultimoContacto).getTime()) < DIAS_SIN_RESPUESTA * DAY) {
      estado = 'falta_camila'
      motivo = cs.length < MIN_CONTACTOS_CAMILA
        ? `Camila le ha escrito ${cs.length} vez/veces durante la desconexión (se exigen ${MIN_CONTACTOS_CAMILA}).`
        : `Aún no pasan ${DIAS_SIN_RESPUESTA} días desde el último mensaje de Camila.`
    }
    else if (!preavisoVigente || (ahora - new Date(preavisoVigente).getTime()) < DIAS_TRAS_PREAVISO * DAY) {
      estado = 'esperando_preaviso'
      motivo = preavisoVigente ? `El preaviso aún no cumple ${DIAS_TRAS_PREAVISO} días.` : 'Cumple todo, pero falta enviarle el preaviso y esperar 7 días.'
    }
    else { estado = 'cumple'; motivo = `${dias} días sin conexión, deuda vencida y sin respuesta a Camila.` }
    candidatos.push({ ...base, estado, motivo })
  }

  candidatos.sort((a, b) => b.dias_sin_conexion - a.dias_sin_conexion)
  const resumen = { cumple: 0, esperando_preaviso: 0, en_preaviso: 0, falta_camila: 0, revision_manual: 0 } as Record<EstadoAutoIW, number>
  for (const c of candidatos) resumen[c.estado]++
  return { candidatos, resumen, excluidos }
}

// Corrida nocturna. Apagado (modo ensayo) → solo informa.
export async function correrAutoIW(sb: SB): Promise<Record<string, unknown>> {
  const cfg = await leerSettings(sb)
  const { candidatos, resumen, excluidos } = await evaluarAutoIW(sb)
  if (!cfg.enabled) return { ok: true, modo: 'ensayo', resumen, excluidos, nota: 'Apagado: no se envían preavisos ni se crean IW.' }

  const hoy = new Date().toISOString().slice(0, 10)
  let preavisos = 0, iws = 0
  const errores: string[] = []

  // Preavisos: a quien le toca y aún no lo tiene (día 28+, o ya en 35+ sin aviso)
  for (const c of candidatos) {
    if (c.preaviso_enviado) continue
    if (!['en_preaviso', 'esperando_preaviso'].includes(c.estado)) continue
    try {
      const p = plantillaPreavisoIW({ nombre: c.estudiante.split(' ')[0] || 'estudiante', programa: c.programa, dias: c.dias_sin_conexion, deuda: c.deuda_vencida })
      const r = await notificarEstudiante(sb, { studentId: c.student_id, enrollmentId: c.enrollment_id, kind: 'iw_preaviso', subject: p.subject, html: p.html, relatedId: null, triggeredBy: 'cron:auto-iw' })
      if (r.ok) preavisos++; else errores.push(`preaviso ${c.estudiante}: ${r.error}`)
    } catch (e) { errores.push(`preaviso ${c.estudiante}: ${e instanceof Error ? e.message : String(e)}`) }
  }

  // IW: los que cumplen, con tope diario
  for (const c of candidatos.filter(x => x.estado === 'cumple' && x.enrollment_id).slice(0, cfg.daily_cap)) {
    try {
      const resolution = await nextResolutionNumber(sb, c.student_id, 'IW', hoy, c.enrollment_id)
      const { data: iw, error } = await sb.from('student_withdrawals').insert({
        student_id: c.student_id, enrollment_id: c.enrollment_id, type: 'IW', resolution_number: resolution,
        withdrawal_date: hoy, status: 'vigente', source: 'erp',
        reason: 'Abandono: desconexión prolongada con deuda vencida',
        note: `Generado automáticamente: ${c.dias_sin_conexion} días sin conexión al campus ni al ERP, deuda vencida de $${c.deuda_vencida.toFixed(2)}, sin respuesta a ${c.camila.contactos} mensajes de Camila y preaviso del ${String(c.preaviso_enviado).slice(0, 10)}. Pendiente de revisión y aprobación en el Gestor IW.`,
      }).select('id').single()
      if (error) { errores.push(`IW ${c.estudiante}: ${error.message}`); continue }
      iws++
      try {
        const p = plantillaIWAutomatico({ nombre: c.estudiante.split(' ')[0] || 'estudiante', programa: c.programa, resolucion: resolution, fechaRetiro: hoy })
        await notificarEstudiante(sb, { studentId: c.student_id, enrollmentId: c.enrollment_id, kind: 'iw_aplicado', subject: p.subject, html: p.html, relatedId: iw?.id ?? null, triggeredBy: 'cron:auto-iw' })
      } catch { /* el correo jamás tumba el IW */ }
    } catch (e) { errores.push(`IW ${c.estudiante}: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const situations = iws ? await recomputeSituations(sb) : null
  return { ok: true, modo: 'activo', preavisos_enviados: preavisos, iw_creados: iws, tope_diario: cfg.daily_cap, resumen, excluidos, situations, errores }
}
