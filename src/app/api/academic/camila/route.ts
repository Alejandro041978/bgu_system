import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { wdb, readAll } from '@/lib/withdrawals'

export const revalidate = 0
export const maxDuration = 120

// ---------------------------------------------------------------------------
// Tablero de Camila.
//
// Abre con UNA cifra: cuántos volvieron al aula. Todo lo demás es diagnóstico
// de por qué esa cifra es la que es.
//
// Un tablero de "mensajes enviados / compromisos conseguidos" sería fácil y
// mentiroso: Camila puede mandar 500 mensajes, conseguir 200 "sí, ya voy a
// entrar" y que no vuelva nadie. Por eso la reconexión se verifica contra
// last_moodle_access, no contra lo que dijo el estudiante.
// ---------------------------------------------------------------------------
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = wdb()
  const students = await readAll(sb, 'academic_students', 'id, situation, phone_number')
  const tracking = await readAll(sb, 'student_tracking', '*')
  const contacts = await readAll(sb, 'retention_contacts', '*').catch(() => [])
  const convs = await readAll(sb, 'sofia_conversations', 'message_count, bot_key')
  const reqs = await readAll(sb, 'withdrawal_requests', 'origin, outcome, stage').catch(() => [])
  const { data: cfg } = await sb.from('retention_settings').select('*').eq('id', 1).maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sById = new Map<string, any>((students as any[]).map(s => [s.id, s]))

  // ── El embudo ────────────────────────────────────────────────────────────
  const total = students.length
  let noActivo = 0, sinTelefono = 0, deudores = 0, elegibles = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eleg: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of tracking as any[]) {
    const s = sById.get(t.student_id)
    if (!s) continue
    if (!['nudge7', 'warn14'].includes(t.risk_level)) continue   // no está ausente
    if (s.situation !== 'activo') { noActivo++; continue }
    if (!s.phone_number) { sinTelefono++; continue }
    if ((t.balance ?? 0) > 0.005) deudores++                     // van por su propia vía
    elegibles++
    eleg.push(t)
  }

  // Contactados y respuestas salen de la BITÁCORA (retention_contacts), no del
  // padrón de ausentes de hoy. Quien fue contactado, respondió y volvió al aula
  // deja de estar en riesgo y sale de `eleg`: contarlo ahí borraba justamente a
  // los casos de éxito (el tablero mostraba "0 respondieron" con 47 respuestas
  // registradas). El alcance de una campaña es acumulado, no una foto.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enviados = (contacts as any[]).filter(c => c.status !== 'failed')
  const contactadosIds = new Set(enviados.map(c => String(c.student_id)))
  const respondieronIds = new Set(enviados.filter(c => c.replied_at).map(c => String(c.student_id)))
  // Primer contacto de cada estudiante: la reconexión se mide desde ahí.
  const primerContacto = new Map<string, string>()
  for (const c of enviados) {
    const k = String(c.student_id)
    if (!primerContacto.has(k) || String(c.sent_at) < primerContacto.get(k)!) primerContacto.set(k, String(c.sent_at))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trackingById = new Map<string, any>((tracking as any[]).map(t => [String(t.student_id), t]))
  const contactados = [...contactadosIds].map(id => trackingById.get(id)).filter(Boolean)
  const respondieron = [...respondieronIds]
  const enCola = Math.max(0, elegibles - eleg.filter(t => contactadosIds.has(String(t.student_id))).length)
  // Volvió = se conectó DESPUÉS de que la campaña lo alcanzó. Para los
  // contactados el ancla es su primer mensaje (dato duro de la bitácora); para
  // el grupo de control, su entrada a la cola.
  const volvieron = (n: typeof eleg) => n.filter(t => {
    if (!t?.last_moodle_access) return false
    const desde = primerContacto.get(String(t.student_id)) ?? t.campaign_entered_at
    return desde && new Date(t.last_moodle_access) > new Date(desde)
  }).length

  // ── Grupo de control: los que siguen en cola no recibieron nada ──────────
  // Sin esto nos atribuiríamos a los que iban a volver solos.
  const cola = eleg.filter(t => (t.contact_attempts ?? 0) === 0 && t.campaign_entered_at)
  const volvieronContactados = volvieron(contactados)
  const volvieronCola = volvieron(cola)
  const pct = (a: number, b: number) => b ? Math.round(a / b * 1000) / 10 : 0

  // ── Por plantilla: ¿cuál engancha? ───────────────────────────────────────
  const porPlantilla: Record<string, { enviados: number; respondieron: number; fallidos: number }> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of contacts as any[]) {
    const k = c.template_key
    porPlantilla[k] = porPlantilla[k] ?? { enviados: 0, respondieron: 0, fallidos: 0 }
    if (c.status === 'failed') { porPlantilla[k].fallidos++; continue }
    porPlantilla[k].enviados++
    if (c.replied_at) porPlantilla[k].respondieron++
  }

  // ── Causas de deserción: el dato que hoy no existe en ningún registro ────
  const trabas: Record<string, number> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of tracking as any[]) {
    if (!String(t.last_outcome ?? '').startsWith('objecion_')) continue
    const k = String(t.last_outcome).replace('objecion_', '')
    trabas[k] = (trabas[k] ?? 0) + 1
  }

  // ── Compromisos: promesa contra realidad ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conCompromiso = (tracking as any[]).filter(t => t.commitment_date)
  const verificados = conCompromiso.filter(t => t.commitment_kept !== null)
  const cumplieron = verificados.filter(t => t.commitment_kept === true).length
  const pendientes = conCompromiso.length - verificados.length

  // ── Resultados del embudo de retiro (Fase B) ─────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const porBot = (reqs as any[]).filter(r => r.origin === 'bot')
  const revertidos = porBot.filter(r => r.outcome === 'revertido').length

  // ── Conversaciones ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cRet = (convs as any[]).filter(c => c.bot_key === 'retencion')
  const msgs = cRet.map(c => c.message_count ?? 0).filter(n => n > 0)
  const promedioMsgs = msgs.length ? Math.round(msgs.reduce((a, b) => a + b, 0) / msgs.length * 10) / 10 : 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bajas = (tracking as any[]).filter(t => t.do_not_contact).length

  return NextResponse.json({
    config: { enabled: cfg?.enabled ?? false, daily_cap: cfg?.daily_cap ?? 0, contact_debtors: cfg?.contact_debtors ?? false },
    embudo: {
      total, no_activo: noActivo, sin_telefono: sinTelefono, deudores,
      elegibles, en_cola: enCola, contactados: contactados.length,
      respondieron: respondieron.length, volvieron: volvieronContactados,
    },
    tasas: {
      respuesta: pct(respondieron.length, contactados.length),
      compromiso: pct(conCompromiso.length, respondieron.length),
      cumplimiento: pct(cumplieron, verificados.length),
      reconexion: pct(volvieronContactados, contactados.length),
    },
    control: {
      contactados: contactados.length, volvieron_contactados: volvieronContactados,
      tasa_contactados: pct(volvieronContactados, contactados.length),
      en_cola: cola.length, volvieron_cola: volvieronCola,
      tasa_cola: pct(volvieronCola, cola.length),
      efecto: pct(volvieronContactados, contactados.length) - pct(volvieronCola, cola.length),
    },
    compromisos: { total: conCompromiso.length, verificados: verificados.length, cumplieron, incumplieron: verificados.length - cumplieron, pendientes },
    plantillas: porPlantilla,
    trabas,
    fase_b: { expedientes: porBot.length, revertidos, loa: porBot.filter(r => r.outcome === 'LOA').length, iw: porBot.filter(r => String(r.outcome ?? '').startsWith('IW')).length },
    conversaciones: { total: cRet.length, promedio_mensajes: promedioMsgs },
    bajas,
  })
}
