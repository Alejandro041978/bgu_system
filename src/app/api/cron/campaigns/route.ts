import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveEligibility } from '@/lib/campaign-resolver'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Motor GENÉRICO de campañas de Camila (multi-campaña, 2026-07-29).
//
// El de retención (/api/cron/retention-campaign) sigue corriendo aparte: está
// cableado a retention_settings y retention_contacts, y no se toca para no
// interrumpir una campaña viva. Este motor atiende a las demás
// (titulacion, ausente, cobranza, cashpay, iw, loa) sobre el modelo `campaigns`.
//
// Reglas: una campaña APAGADA no envía; sin plantilla registrada tampoco (y se
// reporta el motivo); cupo diario PROPIO por campaña; cooldown y opt-out los
// aplica el resolver. `dry_run` permite ver a quién se enviaría sin enviar.
// ---------------------------------------------------------------------------

const EN_COUNTRIES = /^(united states|usa|canada|united kingdom|uk|ireland|australia|new zealand|jamaica|trinidad|guyana|belize|philippines|india|nigeria|ghana|kenya|south africa)$/i
const langOf = (country: string | null) => EN_COUNTRIES.test((country ?? '').trim()) ? 'en' : 'es'

// Solo el primer nombre y capitalizado: un "Hola wilinton  marco antonio" se lee
// como mailing automático y hunde la respuesta (lección de retención).
function saludo(raw: string | null): string | null {
  const first = (raw ?? '').trim().split(/\s+/)[0] ?? ''
  if (!first) return null
  return first.charAt(0).toLocaleUpperCase('es') + first.slice(1).toLocaleLowerCase('es')
}

async function sendTemplate(to: string, contentSid: string, vars: Record<string, string>, creds: { sid: string; token: string; from: string }): Promise<string | null> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.sid}:${creds.token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    // Fuera de la ventana de 24h Twilio exige ContentSid; Body no se entrega.
    body: new URLSearchParams({ From: creds.from, To: to, ContentSid: contentSid, ContentVariables: JSON.stringify(vars) }).toString(),
  })
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json().catch(() => null) as { sid?: string } | null
  return j?.sid ?? null
}

async function run(dryRun: boolean) {
  const sb = db()
  const { campaigns, assignments } = await resolveEligibility(sb)

  // Solo campañas ACTIVAS y distintas de retención (esa tiene su propio cron)
  const activas = campaigns.filter(c => c.active && c.key !== 'retencion')
  if (!activas.length) {
    return { ok: true, enviados: 0, nota: 'Ninguna campaña activa (además de retención)', por_campana: {} }
  }

  // Plantillas y bots
  const { data: tplRows } = await sb.from('whatsapp_templates').select('key, language, content_sid, variables, active')
  const tplOf = new Map<string, { sid: string; vars: Record<string, string> | null }>()
  for (const t of tplRows ?? []) if (t.active && t.content_sid) tplOf.set(`${t.key}|${t.language}`, { sid: t.content_sid, vars: t.variables })
  interface Bot { key: string; twilio_number: string | null; twilio_account_sid: string | null; twilio_auth_token: string | null; active: boolean }
  const { data: botRows } = await sb.from('bots').select('key, twilio_number, twilio_account_sid, twilio_auth_token, active')
  const botOf = new Map<string, Bot>((botRows ?? []).map((b: Bot) => [b.key, b]))

  // Cuántos se enviaron HOY por campaña (para respetar el cupo entre corridas)
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: hoyRows } = await sb.from('campaign_contacts').select('campaign_key').gte('sent_at', hoy + 'T00:00:00Z')
  const enviadosHoy = new Map<string, number>()
  for (const r of hoyRows ?? []) enviadosHoy.set(r.campaign_key, (enviadosHoy.get(r.campaign_key) ?? 0) + 1)

  // Datos de los candidatos
  const ids = [...new Set(assignments.map(a => a.student_id))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stu = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, phone_code, phone_number, country').in('id', ids.slice(i, i + 300))
    for (const s of data ?? []) stu.set(s.id, s)
  }

  const resumen: Record<string, { elegibles: number; enviados: number; saltados: number; motivo?: string }> = {}
  let enviados = 0
  const errores: string[] = []

  for (const camp of activas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = camp as any
    const cola = assignments.filter(a => a.campaign_key === camp.key)
    const cupo = Math.max(0, Number(def.daily_cap ?? 10) - (enviadosHoy.get(camp.key) ?? 0))
    resumen[camp.key] = { elegibles: cola.length, enviados: 0, saltados: 0 }

    const bot = botOf.get(def.bot_key ?? 'retencion')
    if (!bot?.active || !bot?.twilio_number || !bot?.twilio_account_sid) {
      resumen[camp.key].motivo = `bot "${def.bot_key}" inactivo o sin número`
      continue
    }
    const tplKey = def.template_key ?? `camila_${camp.key}`
    if (!tplOf.has(`${tplKey}|es`) && !tplOf.has(`${tplKey}|en`)) {
      resumen[camp.key].motivo = `sin plantilla registrada (${tplKey}) — créala y apruébala en Twilio`
      continue
    }
    if (cupo <= 0) { resumen[camp.key].motivo = 'cupo diario alcanzado'; continue }

    const creds = { sid: bot.twilio_account_sid!, token: bot.twilio_auth_token!, from: bot.twilio_number! }
    for (const a of cola.slice(0, cupo)) {
      const s = stu.get(a.student_id)
      const tel = `${s?.phone_code ?? ''}${s?.phone_number ?? ''}`.replace(/[^\d+]/g, '')
      const nombre = saludo(s?.first_name ?? null)
      if (!s || !tel || tel.length < 8 || !nombre) { resumen[camp.key].saltados++; continue }

      const lang = langOf(s.country)
      const tpl = tplOf.get(`${tplKey}|${lang}`) ?? tplOf.get(`${tplKey}|es`)
      if (!tpl) { resumen[camp.key].saltados++; continue }

      const bitacora = {
        student_id: a.student_id, campaign_key: camp.key, template_key: tplKey,
        language: lang, reason: a.reason, sent_at: new Date().toISOString(),
      }
      if (dryRun) { resumen[camp.key].enviados++; enviados++; continue }
      try {
        const sid = await sendTemplate(`whatsapp:${tel}`, tpl.sid, { '1': nombre }, creds)
        await sb.from('campaign_contacts').insert({ ...bitacora, twilio_sid: sid, status: 'sent' })
        resumen[camp.key].enviados++; enviados++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await sb.from('campaign_contacts').insert({ ...bitacora, status: 'failed', error: msg.slice(0, 300) })
        errores.push(`${camp.key}/${a.student_id}: ${msg.slice(0, 120)}`)
      }
    }
  }

  return { ok: true, dry_run: dryRun, enviados, por_campana: resumen, errores: errores.slice(0, 20) }
}

export async function POST(req: NextRequest) {
  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await run(dryRun))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
