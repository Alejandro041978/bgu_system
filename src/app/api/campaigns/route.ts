import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { resolveEligibility } from '@/lib/campaign-resolver'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET → campañas con su elegibilidad ACTUAL (foto en vivo) y actividad reciente
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const r = await resolveEligibility(sb)

  // Conteos por campaña + muestra de estudiantes
  const byCampaign: Record<string, { count: number; sample: { student_id: string; reason: string }[] }> = {}
  for (const a of r.assignments) {
    if (!byCampaign[a.campaign_key]) byCampaign[a.campaign_key] = { count: 0, sample: [] }
    byCampaign[a.campaign_key].count++
    if (byCampaign[a.campaign_key].sample.length < 5) byCampaign[a.campaign_key].sample.push({ student_id: a.student_id, reason: a.reason })
  }
  // nombres de la muestra
  const sampleIds = [...new Set(Object.values(byCampaign).flatMap(c => c.sample.map(s => s.student_id)))]
  const names: Record<string, string> = {}
  for (let i = 0; i < sampleIds.length; i += 200) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name').in('id', sampleIds.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) names[s.id] = [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ')
  }

  // Contactos de los últimos 30 días por campaña
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: recent } = await sb.from('campaign_contacts')
    .select('campaign_key, outcome').gte('sent_at', desde)
  const sent30: Record<string, { total: number; convertidos: number }> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (recent ?? []) as any[]) {
    if (!sent30[c.campaign_key]) sent30[c.campaign_key] = { total: 0, convertidos: 0 }
    sent30[c.campaign_key].total++
    if (c.outcome === 'convertido') sent30[c.campaign_key].convertidos++
  }

  // ── Retención: motor ANTERIOR, vivo y en paralelo ────────────────────────
  // No es una fila de `campaigns`: tiene su propia config (retention_settings),
  // su bitácora (retention_contacts) y su cron. Cubre la misma audiencia que
  // "ausente" pero con una SECUENCIA de 5 plantillas (día 1/3/7/14 + deuda),
  // algo que el motor nuevo todavía no sabe hacer. Se muestra aquí para tener
  // la foto completa en un solo lugar; su encendido se controla en su página.
  const { data: rCfg } = await sb.from('retention_settings').select('enabled, daily_cap').eq('id', 1).maybeSingle()
  const { data: rRecent } = await sb.from('retention_contacts')
    .select('replied_at, status').gte('sent_at', desde)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rEnviados = ((rRecent ?? []) as any[]).filter(c => c.status !== 'failed')
  const legacy = {
    key: 'retencion', name: 'Retención', priority: 15, cooldown_days: 7,
    active: !!rCfg?.enabled, config: {}, legacy: true,
    description: 'Ausente del aula: secuencia de 5 mensajes (día 1/3/7/14 + deuda). Motor anterior, con su propio cron y bitácora.',
    eligible: 0, sample: [] as { student_id: string; reason: string; name: string }[],
    sent_30d: rEnviados.length,
    converted_30d: rEnviados.filter(c => c.replied_at).length,
    daily_cap: Number(rCfg?.daily_cap ?? 0),
  }

  return NextResponse.json({
    campaigns: [
      ...r.campaigns.map(c => ({
        ...c,
        legacy: false,
        eligible: byCampaign[c.key]?.count ?? 0,
        sample: (byCampaign[c.key]?.sample ?? []).map(s => ({ ...s, name: names[s.student_id] ?? s.student_id })),
        sent_30d: sent30[c.key]?.total ?? 0,
        converted_30d: sent30[c.key]?.convertidos ?? 0,
      })),
      legacy,
    ].sort((a, b) => a.priority - b.priority),
    optouts: r.optouts,
    en_cooldown: r.en_cooldown,
    total_asignados: r.assignments.length,
  })
}

// PATCH { key, active?, cooldown_days?, config? } → configura una campaña
export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.key) return NextResponse.json({ error: 'Falta key' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (b.active != null) patch.active = !!b.active
  if (b.cooldown_days != null) patch.cooldown_days = Math.max(1, Number(b.cooldown_days) || 7)
  if (b.config != null) patch.config = b.config
  const { error } = await db().from('campaigns').update(patch).eq('key', b.key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
