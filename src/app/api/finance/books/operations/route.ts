import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'

export const revalidate = 0
export const maxDuration = 300

const BOOKS_BASE = 'https://www.zohoapis.com/books/v3'
const CUENTAS = ['Returns and Allowances', 'Corporate Sales', 'Individual Sales']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Sesión de usuario O Bearer CRON_SECRET (para sincronizaciones automatizadas)
async function authorized(req: NextRequest): Promise<{ ok: boolean; who: string }> {
  if (req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`) return { ok: true, who: 'cron' }
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user ? { ok: true, who: user.email ?? user.id } : { ok: false, who: '' }
}

async function booksToken(): Promise<string> {
  const sb = db()
  const { data } = await sb.from('app_settings').select('value').eq('key', 'zoho_books_refresh_token').single()
  const refreshToken = data?.value ?? process.env.ZOHO_BOOKS_REFRESH_TOKEN
  if (!refreshToken) throw new Error('Sin refresh token de Books')
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const d = await res.json() as { access_token?: string; error?: string }
  if (!d.access_token) throw new Error('Token Books: ' + (d.error ?? 'sin access_token'))
  return d.access_token
}

// GET → operaciones almacenadas (filtros: account, status)
export async function GET(req: NextRequest) {
  const a = await authorized(req)
  if (!a.ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const account = req.nextUrl.searchParams.get('account')
  const status = req.nextUrl.searchParams.get('status')
  let q = sb.from('books_operations').select('*').order('txn_date', { ascending: false }).limit(2000)
  if (account) q = q.eq('account_name', account)
  if (status) q = q.eq('gestion_status', status)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ operations: data ?? [], cuentas: CUENTAS })
}

// POST { from_date?, to_date?, inspect? } → sincroniza desde Zoho Books
// (reporte Account Transactions filtrado a las 3 cuentas). inspect=true
// devuelve la respuesta cruda (primer tramo) para calibrar el parser.
export async function POST(req: NextRequest) {
  const a = await authorized(req)
  if (!a.ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { from_date?: string; to_date?: string; inspect?: boolean }
  const from = b.from_date ?? `${new Date().getFullYear()}-01-01`
  const to = b.to_date ?? new Date().toISOString().slice(0, 10)

  const token = await booksToken()
  const org = process.env.ZOHO_BOOKS_ORG_ID ?? process.env.ZOHO_ORGANIZATION_ID!
  const sb = db()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authErr = (res: Response, d: any) => {
    if (res.status === 401 || d?.code === 57) {
      return NextResponse.json({ error: 'El token de Zoho Books no tiene el permiso para leer transacciones por cuenta. Reautoriza en /api/zoho/books/connect (ahora pide el scope accountants.READ) y reemplaza el refresh token.', needs_reauth: true }, { status: 403 })
    }
    return NextResponse.json({ error: `Books ${res.status}: ${JSON.stringify(d).slice(0, 300)}` }, { status: 502 })
  }

  // 1) Las cuentas objetivo → sus account_id (chart of accounts)
  const coaRes = await fetch(`${BOOKS_BASE}/chartofaccounts?organization_id=${org}&per_page=200`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
  const coa = await coaRes.json().catch(() => null)
  if (!coaRes.ok || coa?.code !== 0) return authErr(coaRes, coa)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cuentas = ((coa.chartofaccounts ?? []) as any[])
    .filter(a => CUENTAS.some(c => String(a.account_name ?? '').toLowerCase() === c.toLowerCase()))
    .map(a => ({ id: String(a.account_id), name: String(a.account_name) }))
  if (!cuentas.length) return NextResponse.json({ error: 'No se encontraron las cuentas objetivo en el plan de cuentas' }, { status: 404 })

  // 2) Transacciones de cada cuenta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let firstRaw: any = null
  for (const cta of cuentas) {
    for (let page = 1; page <= 40; page++) {
      // OJO: `/chartofaccounts/accounttransactions` devuelve solo un RESUMEN por
      // tipo (buckets {entity_type,count}); el que trae las filas planas es
      // `/chartofaccounts/transactions` (clave `transactions`).
      const url = `${BOOKS_BASE}/chartofaccounts/transactions?organization_id=${org}&account_id=${cta.id}&from_date=${from}&to_date=${to}&per_page=200&page=${page}`
      const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
      const d = await res.json().catch(() => null)
      if (!res.ok || d?.code !== 0) return authErr(res, d)
      if (!firstRaw) firstRaw = d
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batch = (Array.isArray(d.transactions) ? d.transactions
        : Array.isArray(d.transaction_list) ? d.transaction_list
        : Array.isArray(d.account_transactions) ? d.account_transactions : []) as any[]
      // la cuenta la aporta el bucle (el reporte no la repite en cada fila)
      for (const t of batch) rows.push({ ...t, account_name: t.account_name ?? cta.name })
      if (!d.page_context?.has_more_page) break
    }
  }

  if (b.inspect) {
    return NextResponse.json({
      inspect: true, total_rows: rows.length,
      cuentas_encontradas: cuentas,
      keys: firstRaw ? Object.keys(firstRaw) : [],
      sample_rows: rows.slice(0, 4),
    })
  }

  // Antes la clave era `categorized_transaction_id`, con este razonamiento: es
  // único por línea, mientras que `transaction_id` se repite cuando una
  // transacción toca la cuenta en varias líneas. El razonamiento es correcto y
  // la conclusión no, porque ese id NO ES ESTABLE: al editar el movimiento en
  // Zoho —por ejemplo, ponerle "Flywire" de referencia— Zoho reexpide la
  // categorización con un id nuevo y el ERP la ve como una operación distinta.
  //
  // Así se colaron dos depósitos por duplicado, $18.459 contados dos veces, y
  // uno de ellos ya estaba cruzado con su desembolso (18/08/2026).
  //
  // La clave de ahora identifica la LÍNEA sin depender de la categorización:
  // qué transacción, en qué cuenta, de qué lado y por cuánto. Sobrevive a que
  // alguien edite el movimiento, que es justo lo que hay que aguantar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claveEstable = (r: any): string => {
    const txn = String(r.transaction_id ?? '')
    const monto = r.credit_amount !== '' && r.credit_amount != null ? r.credit_amount : (r.debit_amount ?? '')
    if (txn) return [txn, r.account_id ?? r.account_name ?? '', r.debit_or_credit ?? '', monto].join('|')
    // Sin transaction_id no hay nada estable a lo que agarrarse: se conserva el
    // hash de siempre, que al menos es determinista.
    return createHash('sha1').update([r.account_name ?? r.account, r.transaction_date ?? r.date, r.transaction_type,
      r.reference_number ?? r.entry_number, r.payee ?? r.contact_name ?? r.customer_name,
      r.debit_amount ?? r.debit, r.credit_amount ?? r.credit, r.description].join('|')).digest('hex')
  }

  // Filtrar a las 3 cuentas y upsert idempotente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const num = (v: any): number | null => (v === '' || v == null) ? null : (Number.isFinite(Number(v)) ? Number(v) : null)
  const objetivo = rows.filter(r => CUENTAS.some(c => String(r.account_name ?? r.account ?? '').toLowerCase() === c.toLowerCase()))
  let upserted = 0
  const batchRows = objetivo.map(r => {
    const key = claveEstable(r)
    const debit = num(r.debit_amount ?? r.debit)
    const credit = num(r.credit_amount ?? r.credit)
    return {
      zoho_key: key,
      account_name: String(r.account_name ?? r.account ?? ''),
      txn_date: (r.transaction_date ?? r.date ?? null) || null,
      txn_type: r.transaction_type_formatted ?? r.transaction_type ?? null,
      reference: r.reference_number || r.entry_number || r.transaction_number || null,
      contact_name: r.payee ?? r.contact_name ?? r.customer_name ?? null,
      description: r.description ?? null,
      debit,
      credit,
      amount: num(r.amount) ?? debit ?? credit,
      raw: r,
      synced_at: new Date().toISOString(),
    }
  })
  // Las filas guardadas con la clave vieja se pasan a la nueva ANTES del
  // upsert. Sin esto, la primera sincronización tras el cambio no encontraría
  // ninguna coincidencia y volvería a insertar las 893 operaciones enteras.
  //
  // Se hace aquí y no en una migración suelta a propósito: así no existe un
  // momento en que el código y los datos estén en versiones distintas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guardadas: any[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from('books_operations').select('id, zoho_key, raw').order('id').range(desde, desde + 999)
    if (error) return NextResponse.json({ error: 'al leer lo ya guardado: ' + error.message }, { status: 500 })
    guardadas.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const yaConNueva = new Set(guardadas.map(o => String(o.zoho_key)))
  let renombradas = 0
  const choques: string[] = []
  for (const o of guardadas) {
    const nueva = o.raw ? claveEstable(o.raw) : null
    if (!nueva || nueva === String(o.zoho_key)) continue
    // Si la clave nueva ya la tiene otra fila, son duplicados que hay que
    // juntar a mano: renombrar reventaría contra el índice único.
    if (yaConNueva.has(nueva)) { choques.push(String(o.zoho_key)); continue }
    const { error } = await sb.from('books_operations').update({ zoho_key: nueva }).eq('id', o.id)
    if (error) return NextResponse.json({ error: `al migrar la clave de ${o.zoho_key}: ${error.message}` }, { status: 500 })
    yaConNueva.add(nueva); yaConNueva.delete(String(o.zoho_key)); renombradas++
  }

  for (let i = 0; i < batchRows.length; i += 200) {
    const { error } = await sb.from('books_operations').upsert(batchRows.slice(i, i + 200), { onConflict: 'zoho_key' })
    if (error) return NextResponse.json({ error: 'upsert: ' + error.message, upserted }, { status: 500 })
    upserted += Math.min(200, batchRows.length - i)
  }
  return NextResponse.json({
    ok: true, periodo: { from, to }, filas_reporte: rows.length, objetivo: objetivo.length, upserted,
    claves_migradas: renombradas,
    ...(choques.length ? { aviso: `${choques.length} operación(es) duplicada(s) que hay que juntar a mano: ${choques.slice(0, 5).join(', ')}` } : {}),
  })
}

// PATCH { id, gestion_status?, gestion_note? } → gestión de la operación
export async function PATCH(req: NextRequest) {
  const a = await authorized(req)
  if (!a.ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const patch: Record<string, unknown> = { gestion_by: a.who, gestion_at: new Date().toISOString() }
  if (b.gestion_status) patch.gestion_status = b.gestion_status
  if (b.gestion_note !== undefined) patch.gestion_note = b.gestion_note?.toString().trim() || null
  const { error } = await db().from('books_operations').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
