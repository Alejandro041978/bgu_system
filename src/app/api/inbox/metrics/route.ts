import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Lee todas las filas de una consulta paginando (evita el tope de 1000 de PostgREST).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(build: (from: number, to: number) => any): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await build(from, from + 999)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

const dayStr = (d: Date) => d.toISOString().slice(0, 10)
function weekStart(iso: string): string {
  const x = new Date(iso)
  const day = (x.getUTCDay() + 6) % 7 // 0 = lunes
  x.setUTCDate(x.getUTCDate() - day)
  return dayStr(x)
}

// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD&granularity=day|week
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const end = sp.get('end') || dayStr(new Date())
  const start = sp.get('start') || dayStr(new Date(Date.now() - 29 * 86_400_000))
  const granularity = sp.get('granularity') === 'week' ? 'week' : 'day'
  const startTs = start + 'T00:00:00.000Z'
  const endTs = end + 'T23:59:59.999Z'

  const sb = db()

  // Conversaciones del buzón (canal + responsable + tiempos). Solo columnas garantizadas.
  const convs = await readAll((f, t) => sb.from('wa_conversations')
    .select('id, channel, assigned_name, first_customer_at, created_at, first_response_at').range(f, t))

  // Cierres (columna closed_at; si aún no existe el migration, la consulta
  // falla y readAll devuelve [] sin romper el resto de la página).
  const closedRows = await readAll((f, t) => sb.from('wa_conversations')
    .select('closed_at, first_customer_at, created_at').not('closed_at', 'is', null).range(f, t))
  const channelById = new Map<string, string>()
  for (const c of convs) channelById.set(c.id, c.channel ?? 'whatsapp')

  // Mensajes entrantes (para contar correos recibidos)
  const inMsgs = await readAll((f, t) => sb.from('wa_messages')
    .select('conversation_id, created_at').eq('direction', 'in')
    .gte('created_at', startTs).lte('created_at', endTs).range(f, t))

  // Conversaciones de Sofía (soporte)
  const sofia = await readAll((f, t) => sb.from('sofia_conversations')
    .select('created_at').eq('bot_key', 'sofia')
    .gte('created_at', startTs).lte('created_at', endTs).range(f, t))

  const inRange = (ts: string | null) => !!ts && ts >= startTs && ts <= endTs
  const bucketOf = (ts: string) => (granularity === 'week' ? weekStart(ts) : ts.slice(0, 10))

  // Acumuladores por bucket
  const buckets = new Map<string, { emails: number; conversations: number; wa_conversations: number; sofia: number }>()
  const ensure = (b: string) => {
    let x = buckets.get(b)
    if (!x) { x = { emails: 0, conversations: 0, wa_conversations: 0, sofia: 0 }; buckets.set(b, x) }
    return x
  }

  const totals = { emails: 0, conversations: 0, email_conversations: 0, whatsapp_conversations: 0, sofia: 0 }

  // Reparto por responsable (quién atiende qué, por canal): responde
  // directamente "a quiénes se va distribuyendo".
  const agents = new Map<string, { name: string; email: number; whatsapp: number; ticket: number; total: number }>()
  const bumpAgent = (name: string, channel: string) => {
    const key = name || '(sin asignar)'
    let a = agents.get(key)
    if (!a) { a = { name: key, email: 0, whatsapp: 0, ticket: 0, total: 0 }; agents.set(key, a) }
    if (channel === 'email') a.email++
    else if (channel === 'ticket') a.ticket++
    else a.whatsapp++
    a.total++
  }

  // Conversaciones llegadas (por first_customer_at, fallback created_at)
  for (const c of convs) {
    const arrived = c.first_customer_at ?? c.created_at
    if (!inRange(arrived)) continue
    const b = ensure(bucketOf(arrived))
    b.conversations++
    totals.conversations++
    const ch = c.channel ?? 'whatsapp'
    if (ch === 'email') totals.email_conversations++
    else { b.wa_conversations++; totals.whatsapp_conversations++ }
    bumpAgent(c.assigned_name ?? '', ch)
  }

  const by_agent = [...agents.values()].sort((a, b) => b.total - a.total)

  // Correos recibidos = mensajes entrantes de conversaciones de canal email
  for (const m of inMsgs) {
    if ((channelById.get(m.conversation_id) ?? '') !== 'email') continue
    ensure(bucketOf(m.created_at)).emails++
    totals.emails++
  }

  // Conversaciones de Sofía
  for (const s of sofia) {
    ensure(bucketOf(s.created_at)).sofia++
    totals.sofia++
  }

  const series = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, v]) => ({ bucket, ...v }))

  // ── SLA: tiempo de 1ª respuesta y de resolución (dentro del rango) ──────────
  const startMs = new Date(startTs).getTime()
  const endMs = new Date(endTs).getTime()
  const inR = (ts: string | null) => { if (!ts) return false; const m = new Date(ts).getTime(); return m >= startMs && m <= endMs }
  const respMs: number[] = []
  const resMs: number[] = []
  const dist = { lt1h: 0, lt4h: 0, lt24h: 0, gte24h: 0 }
  // 1ª respuesta: casos llegados en el rango que ya recibieron respuesta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of convs as any[]) {
    if (inR(c.first_customer_at) && c.first_response_at) {
      const ms = new Date(c.first_response_at).getTime() - new Date(c.first_customer_at).getTime()
      if (ms >= 0) respMs.push(ms)
    }
  }
  // Resolución: casos CERRADOS dentro del rango
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of closedRows as any[]) {
    if (!inR(c.closed_at)) continue
    const start0 = c.first_customer_at ?? c.created_at
    if (!start0) continue
    const ms = new Date(c.closed_at).getTime() - new Date(start0).getTime()
    if (ms >= 0) {
      resMs.push(ms)
      const h = ms / 3_600_000
      if (h < 1) dist.lt1h++; else if (h < 4) dist.lt4h++; else if (h < 24) dist.lt24h++; else dist.gte24h++
    }
  }
  const median = (a: number[]): number | null => {
    if (!a.length) return null
    const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
  }
  const avg = (a: number[]): number | null => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null
  const sla = {
    first_response: { count: respMs.length, median_ms: median(respMs), avg_ms: avg(respMs) },
    resolution: { count: resMs.length, median_ms: median(resMs), avg_ms: avg(resMs), dist },
  }

  return NextResponse.json({ start, end, granularity, totals, series, sla, by_agent })
}
