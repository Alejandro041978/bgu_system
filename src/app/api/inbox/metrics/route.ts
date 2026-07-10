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

  // Conversaciones del buzón (canal + fecha de llegada)
  const convs = await readAll((f, t) => sb.from('wa_conversations')
    .select('id, channel, first_customer_at, created_at').range(f, t))
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

  // Conversaciones llegadas (por first_customer_at, fallback created_at)
  for (const c of convs) {
    const arrived = c.first_customer_at ?? c.created_at
    if (!inRange(arrived)) continue
    const b = ensure(bucketOf(arrived))
    b.conversations++
    totals.conversations++
    if ((c.channel ?? 'whatsapp') === 'email') totals.email_conversations++
    else { b.wa_conversations++; totals.whatsapp_conversations++ }
  }

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

  return NextResponse.json({ start, end, granularity, totals, series })
}
