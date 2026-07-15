import { NextRequest, NextResponse } from 'next/server'
import { wdb, readAll } from '@/lib/withdrawals'

export const maxDuration = 120

// ---------------------------------------------------------------------------
// Trae los ContentSid de Twilio y los guarda en whatsapp_templates.
//
// Las plantillas se aprueban en Meta, pero para enviarlas por Twilio hace falta
// el ContentSid (HX...) que Twilio les asigna al sincronizarlas desde la WABA.
// Copiar 8 a mano es una fuente de erratas silenciosas (un SID mal pegado = un
// mensaje que no sale y nadie se entera), así que se leen de la API.
//
// Las credenciales salen del bot 'retencion' en la base; nunca del chat.
// ---------------------------------------------------------------------------

type Content = { sid: string; friendly_name: string; language: string }

async function fetchAllContent(sid: string, token: string): Promise<Content[]> {
  const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`
  const out: Content[] = []
  let url: string | null = 'https://content.twilio.com/v1/Content?PageSize=100'
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: auth } })
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const j = await res.json() as { contents?: Content[]; meta?: { next_page_url?: string | null } }
    out.push(...(j.contents ?? []))
    url = j.meta?.next_page_url ?? null
  }
  return out
}

async function run() {
  const sb = wdb()
  const { data: bot } = await sb.from('bots')
    .select('twilio_account_sid, twilio_auth_token').eq('key', 'retencion').maybeSingle()

  const sid = bot?.twilio_account_sid ?? process.env.TWILIO_ACCOUNT_SID
  const token = bot?.twilio_auth_token ?? process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) {
    return { ok: false, error: 'El bot retencion no tiene twilio_account_sid / twilio_auth_token, y no hay variables de entorno de respaldo.' }
  }

  const contents = await fetchAllContent(sid, token)

  // readAll devuelve [] si la tabla no existe, así que hay que distinguir
  // "no hay nada que sincronizar" de "la migración no se corrió": si no,
  // el endpoint responde "todo en orden" sobre una tabla inexistente.
  const { error: tblErr } = await sb.from('whatsapp_templates').select('key').limit(1)
  if (tblErr) return { ok: false, error: 'Falta correr supabase/whatsapp_templates.sql: ' + tblErr.message }

  const rows = await readAll(sb, 'whatsapp_templates', 'key, language, content_sid')
  if (!rows.length) return { ok: false, error: 'whatsapp_templates está vacía: falta la semilla de whatsapp_templates.sql.' }

  const actualizados: string[] = []
  const noEncontrados: string[] = []
  for (const r of rows as { key: string; language: string; content_sid: string | null }[]) {
    // Twilio guarda el idioma como 'es'/'en' o 'es_ES'/'en_US' según cómo se sincronice.
    const hit = contents.find(c =>
      c.friendly_name === r.key && (c.language ?? '').toLowerCase().startsWith(r.language.toLowerCase()))
    if (!hit) { noEncontrados.push(`${r.key} (${r.language})`); continue }
    if (hit.sid === r.content_sid) continue
    await sb.from('whatsapp_templates')
      .update({ content_sid: hit.sid, updated_at: new Date().toISOString() })
      .eq('key', r.key).eq('language', r.language)
    actualizados.push(`${r.key} (${r.language}) -> ${hit.sid}`)
  }

  const conSid = (rows as { content_sid: string | null }[]).filter(r => r.content_sid).length + actualizados.length
  return {
    ok: contents.length > 0 && noEncontrados.length === 0,
    en_twilio: contents.length,
    actualizados,
    no_encontrados: noEncontrados,
    nota: contents.length === 0
      ? 'Twilio no ve NINGUNA plantilla. Hay que sincronizarlas desde la WABA en Twilio Console → Content Template Builder; aprobarlas en Meta no basta.'
      : noEncontrados.length
        ? 'Las no encontradas no están sincronizadas en Twilio, o su friendly_name no calza con el key.'
        : `Listo: ${conSid} de ${rows.length} plantillas con ContentSid.`,
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try { return NextResponse.json(await run()) }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function POST(req: NextRequest) { return GET(req) }
