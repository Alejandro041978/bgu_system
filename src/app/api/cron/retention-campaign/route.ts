import { NextRequest, NextResponse } from 'next/server'
import { wdb, readAll } from '@/lib/withdrawals'

export const maxDuration = 300

// ---------------------------------------------------------------------------
// Motor de cadencia de Camila: elige a quién escribirle hoy y con qué plantilla.
//
// Cadencia 1 / 3 / 7 / 14 días. Sólo aplica MIENTRAS NO RESPONDA: apenas
// contesta se abre la ventana de 24h y todo sigue en conversación libre, que no
// gasta reputación. Por eso los toques con plantilla son pocos y espaciados.
// ---------------------------------------------------------------------------

// Días que deben pasar desde el último toque para mandar el siguiente.
// intentos 0 -> ahora (día 1) · 1 -> +2 (día 3) · 2 -> +4 (día 7) · 3 -> +7 (día 14)
const GAP_DAYS = [0, 2, 4, 7]
const TEMPLATES = ['camila_saludo_dia1', 'camila_seguimiento_dia3', 'camila_recordatorio_dia7', 'camila_ultimo_dia14']
const MAX_ATTEMPTS = 4

// No hay columna de idioma; se deduce del país. Ante la duda, español.
const EN_COUNTRIES = /^(united states|usa|canada|united kingdom|uk|ireland|australia|new zealand|jamaica|trinidad|guyana|belize|philippines|india|nigeria|ghana|kenya|south africa)$/i
const langOf = (country: string | null) => EN_COUNTRIES.test((country ?? '').trim()) ? 'en' : 'es'

async function sendTemplate(to: string, contentSid: string, vars: Record<string, string>, creds: { sid: string; token: string; from: string }) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.sid}:${creds.token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    // Fuera de la ventana de 24h Twilio exige ContentSid; Body no se entrega.
    body: new URLSearchParams({
      From: creds.from, To: to,
      ContentSid: contentSid,
      ContentVariables: JSON.stringify(vars),
    }).toString(),
  })
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

async function run(dryRun: boolean) {
  const sb = wdb()

  const { data: cfg } = await sb.from('retention_settings').select('*').eq('id', 1).maybeSingle()
  if (!cfg?.enabled && !dryRun) return { ok: true, skipped: 'campaña desactivada (retention_settings.enabled = false)' }
  const cap = cfg?.daily_cap ?? 50

  const { data: bot } = await sb.from('bots').select('twilio_number, twilio_account_sid, twilio_auth_token, active').eq('key', 'retencion').maybeSingle()
  if (!bot?.active) return { ok: true, skipped: 'bot retencion inactivo' }

  const tpls = await readAll(sb, 'whatsapp_templates', 'key, language, content_sid, active')
  const sidOf = new Map<string, string>()
  for (const t of tpls as { key: string; language: string; content_sid: string | null; active: boolean }[]) {
    if (t.active && t.content_sid) sidOf.set(`${t.key}|${t.language}`, t.content_sid)
  }

  // --- universo ---
  const students = await readAll(sb, 'academic_students', 'id, first_name, phone_number, country, situation')
  const tracking = await readAll(sb, 'student_tracking', '*')
  const openReqs = await readAll(sb, 'withdrawal_requests', 'student_id, stage')
  const conExpediente = new Set<string>((openReqs as { student_id: string; stage: string }[])
    .filter(r => r.stage !== 'resuelto' && r.stage !== 'anulado').map(r => r.student_id))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sById = new Map<string, any>((students as any[]).map(s => [s.id, s]))
  const now = Date.now()
  const DAY = 86_400_000

  type Cand = { id: string; name: string; phone: string; lang: string; attempt: number; days: number }
  const cands: Cand[] = []
  const skip = { no_activo: 0, sin_telefono: 0, do_not_contact: 0, con_expediente: 0, agotados: 0, aun_no_toca: 0, conversando: 0, con_compromiso: 0 }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of tracking as any[]) {
    const s = sById.get(t.student_id)
    if (!s) continue
    if (s.situation !== 'activo') { skip.no_activo++; continue }           // egresados, retirados, campus socio
    if (!['nudge7', 'warn14'].includes(t.risk_level)) continue
    if (!s.phone_number) { skip.sin_telefono++; continue }
    if (t.do_not_contact) { skip.do_not_contact++; continue }
    if (conExpediente.has(t.student_id)) { skip.con_expediente++; continue } // lo gestiona un humano

    // Ya está conversando: la ventana de 24h se maneja libre, sin plantillas.
    if (t.last_outcome_at && now - new Date(t.last_outcome_at).getTime() < 7 * DAY) { skip.conversando++; continue }
    // Prometió volver y la fecha aún no llega: se le da su plazo.
    if (t.commitment_date && t.commitment_kept === null && new Date(t.commitment_date).getTime() >= now) { skip.con_compromiso++; continue }

    const attempt = t.contact_attempts ?? 0
    if (attempt >= MAX_ATTEMPTS) { skip.agotados++; continue }
    if (attempt > 0 && t.last_contact_at && now - new Date(t.last_contact_at).getTime() < GAP_DAYS[attempt] * DAY) { skip.aun_no_toca++; continue }

    cands.push({
      id: t.student_id, name: s.first_name ?? 'estudiante', phone: s.phone_number,
      lang: langOf(s.country), attempt, days: t.inactivity_days ?? 999,
    })
  }

  // --- prioridad: primero el más recuperable ---
  // Quien lleva 7 días fuera vuelve mucho más fácil que quien lleva 90. Con
  // tope diario, el orden decide a quién salvamos: los frescos primero. Y quien
  // ya está en la cadencia va antes que uno nuevo, para no dejar conversaciones
  // a medias.
  cands.sort((a, b) => (b.attempt > 0 ? 1 : 0) - (a.attempt > 0 ? 1 : 0) || a.days - b.days)

  const hoy = cands.slice(0, cap)
  const creds = {
    sid: bot.twilio_account_sid ?? process.env.TWILIO_ACCOUNT_SID!,
    token: bot.twilio_auth_token ?? process.env.TWILIO_AUTH_TOKEN!,
    from: bot.twilio_number!,
  }

  const enviados: string[] = []
  const errores: string[] = []
  const sinPlantilla: string[] = []

  for (const c of hoy) {
    const key = TEMPLATES[c.attempt]
    const sid = sidOf.get(`${key}|${c.lang}`)
    if (!sid) { sinPlantilla.push(`${key}|${c.lang}`); continue }
    const vars: Record<string, string> = { '1': c.name }
    if (key === 'camila_recordatorio_dia7') vars['2'] = String(c.days)   // esa plantilla lleva los días

    if (dryRun) { enviados.push(`${c.name} · ${key} · ${c.lang} · ${c.days}d`); continue }
    try {
      await sendTemplate(`whatsapp:${c.phone.replace(/\s/g, '')}`, sid, vars, creds)
      await sb.from('student_tracking').update({
        contact_attempts: c.attempt + 1,
        last_contact_at: new Date().toISOString(),
        last_message_level: key,
        last_message_at: new Date().toISOString(),
      }).eq('student_id', c.id)
      enviados.push(`${c.name} · ${key}`)
    } catch (e) {
      errores.push(`${c.name}: ${(e as Error).message}`)
    }
  }

  return {
    ok: true, dryRun,
    elegibles: cands.length, cap, enviados: enviados.length,
    sin_plantilla: [...new Set(sinPlantilla)],
    errores: errores.slice(0, 5),
    omitidos: skip,
    muestra: enviados.slice(0, 10),
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try { return NextResponse.json(await run(req.nextUrl.searchParams.get('dry') === '1')) }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function POST(req: NextRequest) { return GET(req) }
