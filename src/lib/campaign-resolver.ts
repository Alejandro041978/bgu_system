// ---------------------------------------------------------------------------
// Resolver de elegibilidad del motor de campañas (taxonomía del usuario,
// 2026-07-23). UN estudiante → UNA campaña a la vez, decidida por su estado:
//   Activo egresado sin título → titulacion
//   Activo faltando a clases   → ausente   (si revela deuda → cobranza)
//   Activo con deuda vencida   → cobranza
//   Activo al día              → cashpay
//   No activo IW               → iw
//   No activo LOA              → loa
// Colisiones por prioridad (campaigns.priority): titulacion > ausente >
// cobranza > cashpay. El opt-out es UNIVERSAL. Las campañas apagadas no
// asignan a nadie.
// ---------------------------------------------------------------------------

export interface CampaignDef { key: string; name: string; priority: number; cooldown_days: number; active: boolean; config: Record<string, unknown> }
export interface Assignment { student_id: string; campaign_key: string; reason: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(sb: any, t: string, s: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from(t).select(s).range(f, f + 999)
    if (error) throw new Error(t + ': ' + error.message)
    o.push(...(data ?? [])); if ((data ?? []).length < 1000) break
  }
  return o
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveEligibility(sb: any): Promise<{
  campaigns: CampaignDef[]
  assignments: Assignment[]
  optouts: number
  en_cooldown: number
}> {
  const [campRows, students, optoutRows, grads, tracking, charges, payments, contacts] = await Promise.all([
    fetchAll(sb, 'campaigns', '*'),
    fetchAll(sb, 'academic_students', 'id, situation, disabled'),
    fetchAll(sb, 'campaign_optouts', 'student_id'),
    fetchAll(sb, 'student_graduations', 'student_id, titulacion_status'),
    fetchAll(sb, 'student_tracking', 'student_id, inactivity_days'),
    fetchAll(sb, 'account_charges', 'student_id, amount, due_date'),
    fetchAll(sb, 'account_payments', 'student_id, amount'),
    fetchAll(sb, 'campaign_contacts', 'student_id, sent_at'),
  ])
  // El cooldown debe mirar TAMBIÉN la bitácora del motor de retención: es un
  // sistema paralelo (retention_settings + su propio cron) que contacta a la
  // MISMA gente que la campaña "ausente". Sin esto, encender "ausente" con
  // retención viva le manda dos mensajes distintos a la misma persona y rompe
  // la regla "un número, una persona".
  const retentionContacts = await fetchAll(sb, 'retention_contacts', 'student_id, sent_at, status')
    .then(rows => rows.filter(r => r.status !== 'failed'))
    .catch(() => [])

  const campaigns = (campRows as CampaignDef[]).sort((a, b) => a.priority - b.priority)
  const activeKeys = new Set(campaigns.filter(c => c.active).map(c => c.key))
  const optouts = new Set(optoutRows.map(o => String(o.student_id)))

  // Señales por estudiante ------------------------------------------------
  const hoy = new Date().toISOString().slice(0, 10)
  const pendienteTitulo = new Set(grads.filter(g => g.titulacion_status === 'pendiente').map(g => String(g.student_id)))

  const ausenteCfg = campaigns.find(c => c.key === 'ausente')
  const umbralDias = Number((ausenteCfg?.config as { inactivity_days?: number })?.inactivity_days ?? 7)
  const inactivos = new Map<string, number>()
  for (const t of tracking) if (t.inactivity_days != null) inactivos.set(String(t.student_id), Number(t.inactivity_days))

  const exigibleBy = new Map<string, number>(), totalBy = new Map<string, number>(), paidBy = new Map<string, number>()
  for (const c of charges) {
    if (!c.student_id) continue
    const amt = Number(c.amount ?? 0)
    totalBy.set(String(c.student_id), (totalBy.get(String(c.student_id)) ?? 0) + amt)
    // "Vencida" = la definición OFICIAL del ERP (la misma de la restricción de
    // Moodle y el reporte de deuda): con fecha de vencimiento y ya cumplida.
    // Una cuota SIN fecha (p. ej. el enrollment) no está vencida — cuenta en el
    // saldo total (cashpay), no en cobranza. Antes se contaba como vencida y
    // la campaña habría cobrado deudas que el resto del ERP no llama deuda.
    if (c.due_date && String(c.due_date).slice(0, 10) <= hoy) {
      exigibleBy.set(String(c.student_id), (exigibleBy.get(String(c.student_id)) ?? 0) + amt)
    }
  }
  for (const p of payments) {
    if (!p.student_id) continue
    paidBy.set(String(p.student_id), (paidBy.get(String(p.student_id)) ?? 0) + Number(p.amount ?? 0))
  }

  // Cooldown GLOBAL: último contacto de CUALQUIER campaña, incluida retención
  const lastContact = new Map<string, string>()
  for (const c of [...contacts, ...retentionContacts]) {
    if (!c.student_id || !c.sent_at) continue
    const k = String(c.student_id)
    if (!lastContact.has(k) || String(c.sent_at) > lastContact.get(k)!) lastContact.set(k, String(c.sent_at))
  }
  const cooldownGlobal = Math.max(...campaigns.map(c => c.cooldown_days), 7)

  // Asignación: una campaña por estudiante, por prioridad -------------------
  const assignments: Assignment[] = []
  let enCooldown = 0
  for (const s of students) {
    if (s.disabled) continue
    const sid = String(s.id)
    if (optouts.has(sid)) continue

    const situ = String(s.situation ?? 'activo').toLowerCase()
    const vencida = (exigibleBy.get(sid) ?? 0) - (paidBy.get(sid) ?? 0)
    const saldoTotal = (totalBy.get(sid) ?? 0) - (paidBy.get(sid) ?? 0)
    const dias = inactivos.get(sid) ?? 0

    // Reglas en orden de precedencia. LOA ANTES que IW y con patrones
    // precisos: la situación de una licencia es 'retiro_temporal', que el
    // viejo /iw|retir/ atrapaba primero (10/09/2026).
    //
    // CASCADA (10/09/2026): si la campaña que le toca está APAGADA, se evalúa
    // la siguiente regla que le calce en vez de descartar al estudiante.
    // Antes, un deudor con 7+ días de inactividad caía en 'ausente' y, con
    // esa campaña apagada, desaparecía de TODAS: 22 de los 25 deudores
    // activos estaban en ese limbo y Cobranza mostraba 2 elegibles.
    const candidatos: { key: string; reason: string }[] = []
    if (/retiro_temporal|loa|licencia/i.test(situ)) candidatos.push({ key: 'loa', reason: 'en licencia (LOA)' })
    else if (/retiro_permanente|iw/i.test(situ)) candidatos.push({ key: 'iw', reason: 'retirado (IW)' })
    if (pendienteTitulo.has(sid)) candidatos.push({ key: 'titulacion', reason: 'egresado sin título' })
    if (/activo|egresado/.test(situ) && dias >= umbralDias) candidatos.push({ key: 'ausente', reason: `${dias} días sin actividad` })
    if (/activo/.test(situ) && vencida > 0.5) candidatos.push({ key: 'cobranza', reason: `deuda vencida $${vencida.toFixed(2)}` })
    if (/activo/.test(situ) && vencida <= 0.5 && saldoTotal > 0.5) candidatos.push({ key: 'cashpay', reason: `al día, saldo futuro $${saldoTotal.toFixed(2)}` })
    const elegido = candidatos.find(c => activeKeys.has(c.key))
    if (!elegido) continue
    const key = elegido.key, reason = elegido.reason

    // Cooldown global entre campañas
    const last = lastContact.get(sid)
    if (last) {
      const days = (Date.now() - new Date(last).getTime()) / 86400000
      if (days < cooldownGlobal) { enCooldown++; continue }
    }
    assignments.push({ student_id: sid, campaign_key: key, reason })
  }

  return { campaigns, assignments, optouts: optouts.size, en_cooldown: enCooldown }
}
