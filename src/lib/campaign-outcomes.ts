// ---------------------------------------------------------------------------
// Éxito por campaña (decisión del usuario, 2026-07-29): cada campaña se mide
// por SU propio resultado, no por una métrica única.
//
//   titulacion → solicitó su título (document_requests de título)
//   cobranza   → pagó (bajó su deuda vencida tras el contacto)
//   cashpay    → pagó (registró un pago posterior al contacto)
//   ausente    → volvió al aula (conexión a Moodle posterior al contacto)
//   iw / loa   → se reincorporó (su situación dejó de ser retiro)
//
// Regla heredada de retención: el éxito se verifica contra un HECHO posterior
// al contacto (pago, conexión, solicitud), NUNCA contra lo que el estudiante
// prometió. Ver [[project_retention_bot]].
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface ContactRow { student_id: string; campaign_key: string; sent_at: string }

export const OUTCOME_LABEL: Record<string, string> = {
  titulacion: 'Solicitó su título',
  cobranza: 'Pagó',
  cashpay: 'Pagó',
  ausente: 'Volvió al aula',
  iw: 'Se reincorporó',
  loa: 'Se reincorporó',
  retencion: 'Volvió al aula',
}

/**
 * Devuelve el conjunto de student_id que CUMPLIERON el resultado de su campaña
 * después de haber sido contactados. Una sola pasada por tipo de evidencia.
 */
export async function computeOutcomes(sb: SB, contacts: ContactRow[]): Promise<Set<string>> {
  const ok = new Set<string>()
  if (!contacts.length) return ok

  // Contacto más ANTIGUO por estudiante+campaña: el resultado cuenta desde ahí.
  const first = new Map<string, string>()
  for (const c of contacts) {
    const k = `${c.student_id}|${c.campaign_key}`
    const prev = first.get(k)
    if (!prev || c.sent_at < prev) first.set(k, c.sent_at)
  }
  const byCampaign = new Map<string, { student_id: string; since: string }[]>()
  for (const [k, since] of first) {
    const [student_id, campaign_key] = k.split('|')
    if (!byCampaign.has(campaign_key)) byCampaign.set(campaign_key, [])
    byCampaign.get(campaign_key)!.push({ student_id, since })
  }
  const ids = [...new Set(contacts.map(c => c.student_id))]

  // ---- Pagos posteriores (cobranza, cashpay) --------------------------------
  const pagoCampaigns = ['cobranza', 'cashpay']
  if (pagoCampaigns.some(k => byCampaign.has(k))) {
    const pagos = new Map<string, string[]>()
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await sb.from('account_payments')
        .select('student_id, paid_date').in('student_id', ids.slice(i, i + 300))
      for (const p of data ?? []) {
        if (!p.student_id || !p.paid_date) continue
        if (!pagos.has(p.student_id)) pagos.set(p.student_id, [])
        pagos.get(p.student_id)!.push(String(p.paid_date))
      }
    }
    for (const k of pagoCampaigns) {
      for (const { student_id, since } of byCampaign.get(k) ?? []) {
        const dia = since.slice(0, 10)
        if ((pagos.get(student_id) ?? []).some(d => d >= dia)) ok.add(student_id)
      }
    }
  }

  // ---- Volvió al aula (ausente) ---------------------------------------------
  if (byCampaign.has('ausente')) {
    const conex = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await sb.from('student_tracking')
        .select('student_id, last_moodle_access').in('student_id', ids.slice(i, i + 300))
      for (const t of data ?? []) if (t.last_moodle_access) conex.set(t.student_id, t.last_moodle_access)
    }
    for (const { student_id, since } of byCampaign.get('ausente') ?? []) {
      const last = conex.get(student_id)
      if (last && last > since) ok.add(student_id)
    }
  }

  // ---- Se reincorporó (iw, loa) --------------------------------------------
  if (byCampaign.has('iw') || byCampaign.has('loa')) {
    const sit = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await sb.from('academic_students')
        .select('id, situation').in('id', ids.slice(i, i + 300))
      for (const s of data ?? []) sit.set(s.id, s.situation ?? '')
    }
    for (const k of ['iw', 'loa']) {
      for (const { student_id } of byCampaign.get(k) ?? []) {
        const s = sit.get(student_id)
        if (s && s !== 'retiro_permanente' && s !== 'retiro_temporal') ok.add(student_id)
      }
    }
  }

  // ---- Solicitó su título (titulacion) --------------------------------------
  if (byCampaign.has('titulacion')) {
    try {
      const { data } = await sb.from('document_requests')
        .select('student_id, requested_at, type:document_types(is_final_degree)')
        .in('student_id', (byCampaign.get('titulacion') ?? []).map(x => x.student_id))
      const pedidos = new Map<string, string[]>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (data ?? []) as any[]) {
        if (!r.type?.is_final_degree) continue
        if (!pedidos.has(r.student_id)) pedidos.set(r.student_id, [])
        pedidos.get(r.student_id)!.push(String(r.requested_at))
      }
      for (const { student_id, since } of byCampaign.get('titulacion') ?? []) {
        if ((pedidos.get(student_id) ?? []).some(d => d >= since)) ok.add(student_id)
      }
    } catch { /* tabla ausente: sin evidencia, no se cuenta */ }
  }

  return ok
}
