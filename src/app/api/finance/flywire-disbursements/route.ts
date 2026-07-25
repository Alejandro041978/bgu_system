import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(sb: any, t: string, s: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from(t).select(s).range(f, f + 999)
    o.push(...(data ?? [])); if ((data ?? []).length < 1000) break
  }
  return o
}
const dayDiff = (a: string | null, b: string | null) => {
  if (!a || !b) return 999
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
}

// GET → desembolsos importados (con su estado de cruce) + resumen
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const disb = await fetchAll(sb, 'flywire_disbursements', '*').catch(() => [])
  disb.sort((a, b) => String(b.disbursement_date).localeCompare(String(a.disbursement_date)))
  const matched = disb.filter(d => d.matched_operation_id).length
  return NextResponse.json({
    disbursements: disb,
    stats: { total: disb.length, matched, unmatched: disb.length - matched },
  })
}

// POST { rows: [{ disbursement_id, date, amount, currency }], commit? } →
// preview (commit=false) o importa + cruza contra las operaciones de Zoho Books.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as {
    rows?: { disbursement_id?: string; date?: string; amount?: number; currency?: string }[]
    commit?: boolean
  } | null
  const rows = (b?.rows ?? []).filter(r => r.disbursement_id && Number(r.amount))
  if (!rows.length) return NextResponse.json({ error: 'No se detectaron desembolsos válidos (revisa que el CSV tenga id, monto y fecha)' }, { status: 400 })

  const sb = db()

  // Operaciones de Books que son DEPÓSITOS aún sin desembolso cruzado
  const ops = (await fetchAll(sb, 'books_operations', 'id, txn_date, txn_type, reference, credit, amount, flywire_disbursement_id'))
    .filter(o => !o.flywire_disbursement_id && /deposit|dep[oó]sito/i.test(String(o.txn_type ?? '')))
    .map(o => ({ ...o, val: o.credit != null ? Number(o.credit) : Number(o.amount ?? 0) }))

  // Cruce voraz por monto exacto + fecha cercana (±7 días); 1 a 1.
  const usedOps = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan: { row: any; op: any | null }[] = []
  for (const r of [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const amt = Number(r.amount)
    const cands = ops.filter(o => !usedOps.has(o.id) && Math.abs(o.val - amt) < 0.01 && dayDiff(o.txn_date, r.date ?? null) <= 7)
      .sort((a, b) => dayDiff(a.txn_date, r.date ?? null) - dayDiff(b.txn_date, r.date ?? null))
    const op = cands[0] ?? null
    if (op) usedOps.add(op.id)
    plan.push({ row: r, op })
  }
  const matched = plan.filter(p => p.op).length

  // PREVIEW: no escribe nada
  if (!b?.commit) {
    return NextResponse.json({
      preview: true, total: rows.length, matched, unmatched: rows.length - matched,
      sample: plan.slice(0, 6).map(p => ({ disbursement_id: p.row.disbursement_id, date: p.row.date, amount: Number(p.row.amount), cruza: !!p.op })),
    })
  }

  // COMMIT: upsert desembolsos + enlazar operaciones cruzadas
  const now = new Date().toISOString()
  const disbRows = rows.map(r => ({
    disbursement_id: String(r.disbursement_id),
    disbursement_date: r.date || null,
    amount: Number(r.amount),
    currency: r.currency || null,
    matched_operation_id: plan.find(p => p.row === r)?.op?.id ?? null,
    imported_by: user.email ?? user.id, imported_at: now,
    raw: r,
  }))
  let imported = 0
  for (let i = 0; i < disbRows.length; i += 200) {
    const { error } = await sb.from('flywire_disbursements').upsert(disbRows.slice(i, i + 200), { onConflict: 'disbursement_id' })
    if (error) return NextResponse.json({ error: 'Falta correr flywire_disbursements.sql: ' + error.message, imported }, { status: 400 })
    imported += Math.min(200, disbRows.length - i)
  }
  // Marcar las operaciones de Books cruzadas como conciliadas
  for (const p of plan) {
    if (!p.op) continue
    await sb.from('books_operations').update({
      flywire_disbursement_id: String(p.row.disbursement_id),
      gestion_status: 'conciliada',
      gestion_note: `Desembolso Flywire ${p.row.disbursement_id}${p.row.date ? ` (${p.row.date})` : ''}`,
      gestion_by: user.email ?? user.id, gestion_at: now,
    }).eq('id', p.op.id)
  }

  return NextResponse.json({ ok: true, imported, matched, unmatched: rows.length - matched })
}
