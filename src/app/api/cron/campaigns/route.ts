import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveEligibility } from '@/lib/campaign-resolver'
import { telefonoE164 } from '@/lib/telefono'

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

  // Último contacto de cada persona por campaña — para ordenar la cola.
  //
  // Sin esto, la cola salía siempre en el mismo orden y, como el cooldown de 7
  // días re-habilita a los ya contactados, el cupo se gastaba re-tocando a los
  // mismos ~35 (cupo × cooldown) por los siglos de los siglos: Titulación
  // envió 120 mensajes a solo 39 personas mientras 251 esperaban su PRIMER
  // toque (detectado por el usuario, 10/09/2026). Regla nueva: primero los
  // NUNCA contactados; los re-toques después, del más antiguo al más reciente.
  const ultimoContacto = new Map<string, string>()
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('campaign_contacts')
      .select('student_id, campaign_key, sent_at').order('sent_at', { ascending: true }).range(f, f + 999)
    for (const r of (data ?? []) as { student_id: string; campaign_key: string; sent_at: string }[]) {
      ultimoContacto.set(`${r.student_id}|${r.campaign_key}`, String(r.sent_at))
    }
    if ((data ?? []).length < 1000) break
  }

  // Datos de los candidatos
  const ids = [...new Set(assignments.map(a => a.student_id))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stu = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, phone_code, phone_number, country').in('id', ids.slice(i, i + 300))
    for (const s of data ?? []) stu.set(s.id, s)
  }

  // ── Estado personal para campañas CON SECUENCIA (fusión Retención→Ausente,
  // 10/09/2026): compromisos, conversaciones activas, no-contactar y
  // expedientes humanos se respetan igual que en el motor viejo. ────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trackingDe = new Map<string, any>()
  const conExpediente = new Set<string>()
  {
    for (let f = 0; ; f += 1000) {
      const { data } = await sb.from('student_tracking')
        .select('student_id, inactivity_days, do_not_contact, last_outcome_at, commitment_date, commitment_kept').range(f, f + 999)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const t of (data ?? []) as any[]) trackingDe.set(String(t.student_id), t)
      if ((data ?? []).length < 1000) break
    }
    const { data: reqs } = await sb.from('withdrawal_requests').select('student_id, stage')
    for (const r of (reqs ?? []) as { student_id: string; stage: string }[]) {
      if (r.stage !== 'resuelto' && r.stage !== 'anulado') conExpediente.add(String(r.student_id))
    }
  }
  const DAY = 86_400_000
  const protegido = (sid: string): string | null => {
    const t = trackingDe.get(sid)
    if (t?.do_not_contact) return 'no contactar'
    if (conExpediente.has(sid)) return 'expediente humano abierto'
    // Está conversando: la ventana de 24h se maneja libre, sin plantillas.
    if (t?.last_outcome_at && Date.now() - new Date(t.last_outcome_at).getTime() < 7 * DAY) return 'conversando'
    // Prometió volver y su fecha aún no llega: se le da su plazo.
    if (t?.commitment_date && t.commitment_kept === null && new Date(t.commitment_date).getTime() >= Date.now()) return 'con compromiso'
    return null
  }
  // Toques por persona y campaña (para el paso de la secuencia)
  const toquesDe = new Map<string, number>()
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('campaign_contacts')
      .select('student_id, campaign_key, status').eq('status', 'sent').range(f, f + 999)
    for (const r of (data ?? []) as { student_id: string; campaign_key: string }[]) {
      const k = `${r.student_id}|${r.campaign_key}`
      toquesDe.set(k, (toquesDe.get(k) ?? 0) + 1)
    }
    if ((data ?? []).length < 1000) break
  }

  const resumen: Record<string, { elegibles: number; enviados: number; saltados: number; motivo?: string }> = {}
  let enviados = 0
  const errores: string[] = []

  for (const camp of activas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = camp as any
    // Nunca contactados primero (avanzar la cola es la prioridad); re-toques
    // después, empezando por quien lleva más tiempo sin noticias.
    const cola = assignments.filter(a => a.campaign_key === camp.key).sort((a, b) => {
      const ua = ultimoContacto.get(`${a.student_id}|${camp.key}`)
      const ub = ultimoContacto.get(`${b.student_id}|${camp.key}`)
      if (!ua && !ub) return 0
      if (!ua) return -1
      if (!ub) return 1
      return ua.localeCompare(ub)
    })
    const cupo = Math.max(0, Number(def.daily_cap ?? 10) - (enviadosHoy.get(camp.key) ?? 0))
    resumen[camp.key] = { elegibles: cola.length, enviados: 0, saltados: 0 }

    const bot = botOf.get(def.bot_key ?? 'retencion')
    if (!bot?.active || !bot?.twilio_number || !bot?.twilio_account_sid) {
      resumen[camp.key].motivo = `bot "${def.bot_key}" inactivo o sin número`
      continue
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const steps: any[] | null = Array.isArray(def.config?.steps) && def.config.steps.length ? def.config.steps : null
    const tplKey = def.template_key ?? `camila_${camp.key}`
    if (!steps && !tplOf.has(`${tplKey}|es`) && !tplOf.has(`${tplKey}|en`)) {
      resumen[camp.key].motivo = `sin plantilla registrada (${tplKey}) — créala y apruébala en Twilio`
      continue
    }
    if (cupo <= 0) { resumen[camp.key].motivo = 'cupo diario alcanzado'; continue }

    const creds = { sid: bot.twilio_account_sid!, token: bot.twilio_auth_token!, from: bot.twilio_number! }

    // ── Campaña CON SECUENCIA (fusión Retención→Ausente, 10/09/2026): cada
    // paso tiene su plantilla y su espera; el estado personal (compromisos,
    // conversaciones, no-contactar, expediente) se respeta como en el motor
    // viejo. La secuencia se DETIENE sola si el estudiante volvió al aula
    // (su inactividad bajó del umbral) y no se reinicia a quien la agotó. ────
    if (steps) {
      const umbral = Number(def.config?.inactivity_days ?? 7)
      type Cand = { sid: string; attempt: number; dias: number; reason: string }
      const cands: Cand[] = []
      // Continuaciones: a mitad de secuencia, con su espera cumplida y aún ausentes
      for (const [k, n] of toquesDe) {
        const [sid, ck] = k.split('|')
        if (ck !== camp.key || n <= 0 || n >= steps.length) continue
        const t = trackingDe.get(sid)
        if ((t?.inactivity_days ?? 0) < umbral) continue
        const last = ultimoContacto.get(`${sid}|${camp.key}`)
        const gap = Number(steps[n]?.gap_days ?? 7)
        if (last && Date.now() - new Date(last).getTime() < gap * DAY) continue
        cands.push({ sid, attempt: n, dias: Number(t?.inactivity_days ?? 0), reason: `paso ${n + 1} de la secuencia` })
      }
      // Nuevos: la cola del resolver, solo quienes nunca recibieron el paso 1
      for (const a of cola) {
        if ((toquesDe.get(`${a.student_id}|${camp.key}`) ?? 0) > 0) continue
        const t = trackingDe.get(String(a.student_id))
        cands.push({ sid: String(a.student_id), attempt: 0, dias: Number(t?.inactivity_days ?? 0), reason: a.reason })
      }
      // Quien está a mitad de cadencia va primero (no dejar conversaciones a
      // medias); entre nuevos, los frescos primero — quien lleva 7 días fuera
      // vuelve más fácil que quien lleva 90 (lección del motor de retención).
      cands.sort((x, y) => (y.attempt > 0 ? 1 : 0) - (x.attempt > 0 ? 1 : 0) || x.dias - y.dias)
      resumen[camp.key].elegibles = cands.length

      // Datos de los de continuación que no vinieron en la cola del resolver
      const faltan = cands.map(c => c.sid).filter(sid => !stu.has(sid))
      for (let i = 0; i < faltan.length; i += 300) {
        const { data } = await sb.from('academic_students')
          .select('id, first_name, last_name, phone_code, phone_number, country').in('id', faltan.slice(i, i + 300))
        for (const s of data ?? []) stu.set(s.id, s)
      }

      let usados = 0
      for (const c of cands) {
        if (usados >= cupo) break
        const s = stu.get(c.sid)
        const tel = telefonoE164(s)
        const nombre = saludo(s?.first_name ?? null)
        if (!s || !tel || tel.length < 8 || !nombre) { resumen[camp.key].saltados++; continue }
        if (protegido(c.sid)) { resumen[camp.key].saltados++; continue }
        const paso = steps[c.attempt]
        const lang = langOf(s.country)
        const tpl = tplOf.get(`${paso.template_key}|${lang}`) ?? tplOf.get(`${paso.template_key}|es`)
        if (!tpl) { resumen[camp.key].saltados++; errores.push(`${camp.key}: sin plantilla ${paso.template_key}`); continue }
        const vars: Record<string, string> = { '1': nombre }
        if (paso.con_dias) vars['2'] = String(c.dias)
        const bitacora = {
          student_id: c.sid, campaign_key: camp.key, template_key: paso.template_key,
          language: lang, reason: c.reason, sent_at: new Date().toISOString(),
        }
        if (dryRun) { resumen[camp.key].enviados++; enviados++; usados++; continue }
        try {
          const sid = await sendTemplate(tel.startsWith('whatsapp:') ? tel : `whatsapp:${tel}`, tpl.sid, vars, creds)
          await sb.from('campaign_contacts').insert({ ...bitacora, twilio_sid: sid, status: 'sent' })
          resumen[camp.key].enviados++; enviados++; usados++
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          await sb.from('campaign_contacts').insert({ ...bitacora, status: 'failed', error: msg.slice(0, 300) })
          errores.push(`${camp.key}/${c.sid}: ${msg.slice(0, 120)}`)
          usados++
        }
      }
      continue
    }

    // El cupo se llena con quien SE PUEDE contactar, no con los primeros de la
    // cola.
    //
    // Antes era cola.slice(0, cupo): se cogían los cinco primeros y a los que
    // no tenían teléfono se les saltaba sin pasar al siguiente. Como el orden
    // de la cola es el mismo cada día, los mismos ilocalizables la encabezaban
    // siempre y la campaña no avanzaba: IW mandó 0 de 5 durante días porque sus
    // cinco primeros no tienen número, y Cash Pay mandó 1 de 5 por lo mismo.
    //
    // Saltar a alguien sin teléfono no gasta cupo —no se contactó a nadie—,
    // pero un fallo de Twilio sí lo gasta: si la plantilla está rota, es
    // preferible que se note en cinco intentos y no que recorra la cola entera
    // generando cientos de errores.
    // ── Survey Titulados: enlace único por estudiante y tope por año ────────
    const esEncuesta = def.config?.survey === 'graduates'
    let inicioAnio: string | null = null
    if (esEncuesta) {
      const hoyStr = new Date().toISOString().slice(0, 10)
      const { data: anioAct } = await sb.from('academic_years')
        .select('start_date').lte('start_date', hoyStr).gte('end_date', hoyStr).limit(1).maybeSingle()
      inicioAnio = anioAct?.start_date ? String(anioAct.start_date) : null
    }
    const maxAnio = Number(def.config?.max_attempts_year ?? 4)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://system.blackwell.university'

    let usados = 0
    for (const a of cola) {
      if (usados >= cupo) break
      const s = stu.get(a.student_id)
      const tel = telefonoE164(s)
      const nombre = saludo(s?.first_name ?? null)
      if (!s || !tel || tel.length < 8 || !nombre) { resumen[camp.key].saltados++; continue }

      const lang = langOf(s.country)
      const tpl = tplOf.get(`${tplKey}|${lang}`) ?? tplOf.get(`${tplKey}|es`)
      if (!tpl) { resumen[camp.key].saltados++; continue }

      // Variables de la plantilla; la encuesta agrega el enlace único y
      // respeta el tope de invitaciones POR AÑO ACADÉMICO (no hostigar).
      const vars: Record<string, string> = { '1': nombre }
      if (esEncuesta) {
        if (inicioAnio) {
          const { count: yaEsteAnio } = await sb.from('campaign_contacts')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_key', camp.key).eq('student_id', a.student_id).eq('status', 'sent')
            .gte('sent_at', inicioAnio + 'T00:00:00Z')
          if ((yaEsteAnio ?? 0) >= maxAnio) { resumen[camp.key].saltados++; continue }
        }
        // Token vigente: la invitación pendiente se reutiliza (mismo enlace en
        // cada re-toque); si no hay, se crea.
        const { data: pend } = await sb.from('graduate_surveys')
          .select('id').eq('student_id', a.student_id).is('completed_at', null)
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        let surveyId = pend?.id ?? null
        if (!surveyId && !dryRun) {
          const { data: nuevo, error: eIns } = await sb.from('graduate_surveys')
            .insert({ student_id: a.student_id, language: lang }).select('id').single()
          if (eIns) { resumen[camp.key].saltados++; errores.push(`${camp.key}/${a.student_id}: ${eIns.message}`); continue }
          surveyId = nuevo.id
        }
        vars['2'] = `${appUrl}/form/graduate-survey/${surveyId ?? '(nuevo)'}`
      }

      const bitacora = {
        student_id: a.student_id, campaign_key: camp.key, template_key: tplKey,
        language: lang, reason: a.reason, sent_at: new Date().toISOString(),
      }
      if (dryRun) { resumen[camp.key].enviados++; enviados++; usados++; continue }
      try {
        const sid = await sendTemplate(`whatsapp:${tel}`, tpl.sid, vars, creds)
        await sb.from('campaign_contacts').insert({ ...bitacora, twilio_sid: sid, status: 'sent' })
        resumen[camp.key].enviados++; enviados++; usados++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await sb.from('campaign_contacts').insert({ ...bitacora, status: 'failed', error: msg.slice(0, 300) })
        errores.push(`${camp.key}/${a.student_id}: ${msg.slice(0, 120)}`)
        usados++
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
