import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { resolveEligibility } from '@/lib/campaign-resolver'
import { computeOutcomes, OUTCOME_LABEL, type ContactRow } from '@/lib/campaign-outcomes'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0

// GET → embudo y resultado de CADA campaña, más el motivo por el que una
// campaña no está enviando (apagada, sin plantilla, sin bot, cupo agotado).
// El éxito se mide con la regla propia de cada campaña (campaign-outcomes).
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const sb = db()
  const { campaigns, assignments, optouts, en_cooldown } = await resolveEligibility(sb)

  // Contactos del modelo nuevo
  const contactos: (ContactRow & { status?: string; replied_at?: string | null })[] = []
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('campaign_contacts')
      .select('student_id, campaign_key, sent_at, status, replied_at').range(f, f + 999)
    contactos.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const exitosos = await computeOutcomes(sb, contactos.filter(c => c.status !== 'failed'))

  // Plantillas y bots disponibles (para explicar por qué una campaña no envía)
  const { data: tplRows } = await sb.from('whatsapp_templates').select('key, language, content_sid, active')
  const tplKeys = new Set((tplRows ?? []).filter((t: { active: boolean; content_sid: string | null }) => t.active && t.content_sid)
    .map((t: { key: string }) => t.key))
  const { data: botRows } = await sb.from('bots').select('key, active, twilio_number')
  const botOk = new Map((botRows ?? []).map((b: { key: string; active: boolean; twilio_number: string | null }) => [b.key, !!(b.active && b.twilio_number)]))

  const hoy = new Date().toISOString().slice(0, 10)
  const filas = campaigns.map(c => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = c as any
    const cola = assignments.filter(a => a.campaign_key === c.key)
    const cs = contactos.filter(x => x.campaign_key === c.key && x.status !== 'failed')
    const alumnosContactados = new Set(cs.map(x => x.student_id))
    const respondieron = new Set(cs.filter(x => x.replied_at).map(x => x.student_id))
    const exito = [...alumnosContactados].filter(id => exitosos.has(id)).length
    const enviadosHoy = cs.filter(x => String(x.sent_at).slice(0, 10) === hoy).length
    const tplKey = def.template_key ?? `camila_${c.key}`

    let bloqueo: string | null = null
    if (!c.active) bloqueo = 'Campaña apagada'
    else if (!botOk.get(def.bot_key ?? 'retencion')) bloqueo = `Bot "${def.bot_key ?? 'retencion'}" inactivo o sin número`
    else if (!tplKeys.has(tplKey)) bloqueo = `Falta la plantilla "${tplKey}" (crearla y aprobarla en Twilio)`
    else if (enviadosHoy >= Number(def.daily_cap ?? 10)) bloqueo = 'Cupo diario alcanzado'

    return {
      key: c.key, nombre: c.name, activa: c.active, prioridad: c.priority,
      cupo_diario: Number(def.daily_cap ?? 10), enviados_hoy: enviadosHoy,
      plantilla: tplKey, tiene_plantilla: tplKeys.has(tplKey), bot: def.bot_key ?? 'retencion',
      elegibles: cola.length,
      en_cola: cola.filter(a => !alumnosContactados.has(a.student_id)).length,
      contactados: alumnosContactados.size,
      respondieron: respondieron.size,
      exito, exito_label: OUTCOME_LABEL[c.key] ?? 'Resultado',
      tasa_respuesta: pct(respondieron.size, alumnosContactados.size),
      tasa_exito: pct(exito, alumnosContactados.size),
      bloqueo,
    }
  }).sort((a, b) => a.prioridad - b.prioridad)

  // Retención: motor ANTERIOR (retention_settings + su cron + retention_contacts).
  // Se incluye para tener la foto completa; su éxito es "volvió al aula" y sus
  // números salen de su propia bitácora.
  const { data: rCfg } = await sb.from('retention_settings').select('enabled, daily_cap').eq('id', 1).maybeSingle()
  const { data: rRows } = await sb.from('retention_contacts').select('student_id, sent_at, status, replied_at')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rSent = ((rRows ?? []) as any[]).filter(c => c.status !== 'failed')
  const rContactados = new Set(rSent.map(c => String(c.student_id)))
  const rRespondieron = new Set(rSent.filter(c => c.replied_at).map(c => String(c.student_id)))
  const rHoy = rSent.filter(c => String(c.sent_at).slice(0, 10) === hoy).length
  const retencion = {
    key: 'retencion', nombre: 'Retención', activa: !!rCfg?.enabled, prioridad: 15,
    cupo_diario: Number(rCfg?.daily_cap ?? 0), enviados_hoy: rHoy,
    plantilla: 'camila_retencion_dia1/3/7/14 + deuda', tiene_plantilla: true, bot: 'retencion',
    elegibles: rContactados.size, en_cola: 0,
    contactados: rContactados.size, respondieron: rRespondieron.size,
    exito: 0, exito_label: OUTCOME_LABEL.retencion,
    tasa_respuesta: pct(rRespondieron.size, rContactados.size), tasa_exito: 0,
    bloqueo: rCfg?.enabled ? null : 'Campaña apagada',
    legacy: true,
  }

  return NextResponse.json({
    campanas: [...filas, retencion].sort((a, b) => a.prioridad - b.prioridad),
    totales: {
      elegibles: filas.reduce((s, f) => s + f.elegibles, 0),
      contactados: filas.reduce((s, f) => s + f.contactados, 0),
      exito: filas.reduce((s, f) => s + f.exito, 0),
      activas: filas.filter(f => f.activa).length,
      bloqueadas: filas.filter(f => f.bloqueo).length,
    },
    optouts, en_cooldown,
  })
}
