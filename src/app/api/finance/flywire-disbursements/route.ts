import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'

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
// Normaliza para comparar referencias con IDs de desembolso: mayúsculas y solo
// alfanumérico, así "ZBL2023-10-18" == "ZBL 2023 10 18" == "zbl20231018".
const normRef = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// GET → desembolsos importados (con su estado de cruce) + resumen. A los que NO
// cruzaron exacto se les adjunta una SUGERENCIA: el depósito de Books más
// cercano en fecha (±3 días) con la diferencia (comisión) — para asociar a mano.
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const disb = await fetchAll(sb, 'flywire_disbursements', '*').catch(() => [])
  disb.sort((a, b) => String(b.disbursement_date).localeCompare(String(a.disbursement_date)))

  // Depósitos de Flywire aún sin cruzar (candidatos para sugerir): contacto "Clientes Varios"
  const ops = (await fetchAll(sb, 'books_operations', 'id, txn_date, contact_name, credit, amount, reference, flywire_disbursement_id'))
    .filter(o => !o.flywire_disbursement_id && /clientes\s*varios/i.test(String(o.contact_name ?? '')))
    .map(o => ({ id: o.id, date: o.txn_date as string | null, val: o.credit != null ? Number(o.credit) : Number(o.amount ?? 0), ref: normRef(o.reference) }))

  const withSug = disb.map(d => {
    if (d.matched_operation_id) return d
    // 1) Por REFERENCIA: el depósito de Books cita el ID del desembolso (señal
    //    conclusiva, el ID es único) — no exige cercanía de fecha ni monto.
    const did = normRef(d.disbursement_id)
    const byRef = did.length >= 5 ? ops.find(o => o.ref.includes(did)) : null
    if (byRef) return { ...d, suggestion: { operation_id: byRef.id, date: byRef.date, amount: byRef.val, diff: Math.round((Number(d.amount) - byRef.val) * 100) / 100, by: 'ref' as const } }
    // 2) Por fecha cercana (±3 días), el más parecido en monto.
    const cands = ops.filter(o => dayDiff(o.date, d.disbursement_date) <= 3)
      .sort((a, b) => Math.abs(a.val - Number(d.amount)) - Math.abs(b.val - Number(d.amount)))
    const s = cands[0]
    return { ...d, suggestion: s ? { operation_id: s.id, date: s.date, amount: s.val, diff: Math.round((Number(d.amount) - s.val) * 100) / 100, by: 'fecha' as const } : null }
  })

  const matched = disb.filter(d => d.matched_operation_id).length
  return NextResponse.json({
    disbursements: withSug,
    stats: { total: disb.length, matched, unmatched: disb.length - matched },
  })
}

// PATCH { disbursement_id, operation_id } → asocia MANUALMENTE un desembolso a
// una operación de Books (para los casos con comisión donde el monto no calza
// exacto). Registra la diferencia en la nota.
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { disbursement_id?: string; operation_id?: string } | null
  if (!b?.disbursement_id || !b?.operation_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  const sb = db()

  const { data: d } = await sb.from('flywire_disbursements').select('disbursement_id, disbursement_date, amount').eq('disbursement_id', b.disbursement_id).maybeSingle()
  if (!d) return NextResponse.json({ error: 'Desembolso no encontrado' }, { status: 404 })
  const { data: op } = await sb.from('books_operations').select('id, credit, amount, flywire_disbursement_id').eq('id', b.operation_id).maybeSingle()
  if (!op) return NextResponse.json({ error: 'Operación de Books no encontrada' }, { status: 404 })
  if (op.flywire_disbursement_id) return NextResponse.json({ error: 'Esa operación ya está conciliada con otro desembolso' }, { status: 409 })

  const val = op.credit != null ? Number(op.credit) : Number(op.amount ?? 0)
  const diff = Math.round((Number(d.amount) - val) * 100) / 100
  const now = new Date().toISOString()
  await sb.from('books_operations').update({
    flywire_disbursement_id: d.disbursement_id, gestion_status: 'conciliada',
    gestion_note: `Desembolso Flywire ${d.disbursement_id}${d.disbursement_date ? ` (${d.disbursement_date})` : ''}${diff ? ` · comisión ${diff.toFixed(2)}` : ''} · asociado manual`,
    gestion_by: user.email ?? user.id, gestion_at: now,
  }).eq('id', op.id)
  await sb.from('flywire_disbursements').update({ matched_operation_id: op.id }).eq('disbursement_id', d.disbursement_id)
  return NextResponse.json({ ok: true, diff })
}

// POST { rows: [{ disbursement_id, date, amount, currency }], commit? } →
// preview (commit=false) o importa + cruza contra las operaciones de Zoho Books.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as {
    rows?: { disbursement_id?: string; date?: string; amount?: number; currency?: string }[]
    commit?: boolean
  } | null
  const crudas = (b?.rows ?? []).filter(r => r.disbursement_id && Number(r.amount))
  if (!crudas.length) return NextResponse.json({ error: 'No se detectaron desembolsos válidos (revisa que el CSV tenga id, monto y fecha)' }, { status: 400 })

  // Dos filas con el mismo identificador rompían el upsert con un error de
  // Postgres —"ON CONFLICT DO UPDATE cannot affect row a second time"— que la
  // pantalla mostraba como "falta correr flywire_disbursements.sql". Ni era eso
  // ni había forma de adivinarlo desde el aviso.
  //
  // Hay dos casos y NO se tratan igual:
  //
  //  · la misma fila repetida (mismo importe y fecha): es ruido del export, se
  //    queda una y no se pierde nada;
  //  · el mismo identificador con importes distintos: eso es dinero que no
  //    cuadra, y elegir uno por su cuenta es justo lo que no debe hacer un
  //    importador. Se para y se dice cuáles son.
  const porId = new Map<string, typeof crudas>()
  for (const r of crudas) {
    const k = String(r.disbursement_id)
    porId.set(k, [...(porId.get(k) ?? []), r])
  }
  const enConflicto = [...porId.entries()].filter(([, v]) =>
    new Set(v.map(r => `${Number(r.amount)}|${r.date ?? ''}`)).size > 1)
  if (enConflicto.length) {
    return NextResponse.json({
      error: `El CSV trae ${enConflicto.length} identificador(es) repetido(s) con datos distintos, así que no se importa nada: `
        + enConflicto.slice(0, 5).map(([k, v]) => `${k} (${v.map(r => `${r.date ?? 'sin fecha'} $${Number(r.amount)}`).join(' y ')})`).join('; ')
        + (enConflicto.length > 5 ? ` …y ${enConflicto.length - 5} más` : '')
        + '. Corrige el archivo o dale un identificador propio a cada desembolso.',
    }, { status: 400 })
  }
  const rows = [...porId.values()].map(v => v[0])
  const repetidas = crudas.length - rows.length

  const sb = db()

  // Operaciones de Books que son SETTLEMENTS de Flywire aún sin cruzar. El
  // marcador confiable es el CONTACTO "Clientes Varios" (el abono agregado):
  // ni el txn_type ni la referencia son consistentes entre años (PAYOUTS, Flywire
  // o un número según la época). Las ventas directas tienen contacto con nombre.
  const ops = (await fetchAll(sb, 'books_operations', 'id, txn_date, contact_name, credit, amount, reference, flywire_disbursement_id'))
    .filter(o => !o.flywire_disbursement_id && /clientes\s*varios/i.test(String(o.contact_name ?? '')))
    .map(o => ({ ...o, val: o.credit != null ? Number(o.credit) : Number(o.amount ?? 0), nref: normRef(o.reference) }))

  // Estado previo: desembolsos ya importados y su cruce (para no re-cruzar ni
  // reportar como "sin cruce" lo que ya estaba conciliado).
  const { data: existing } = await sb.from('flywire_disbursements')
    .select('disbursement_id, matched_operation_id').in('disbursement_id', rows.map(r => String(r.disbursement_id)))
  const prevMatch = new Map<string, string | null>((existing ?? []).map((e: { disbursement_id: string; matched_operation_id: string | null }) => [String(e.disbursement_id), e.matched_operation_id]))

  // Cruce voraz por monto exacto + fecha cercana (±7 días); 1 a 1. Los ya
  // conciliados conservan su cruce y no compiten por operaciones.
  const usedOps = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan: { row: any; op: { id: string } | null; already: boolean }[] = []
  for (const r of [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const prev = prevMatch.get(String(r.disbursement_id))
    if (prev) { plan.push({ row: r, op: { id: prev }, already: true }); continue }
    const amt = Number(r.amount)
    // 1) Por REFERENCIA: el depósito de Books cita el ID del desembolso. Señal
    //    conclusiva (el ID es único) — no exige ventana de fecha ni monto, porque
    //    contabilidad a veces fraccionó el desembolso en varias líneas.
    const did = normRef(r.disbursement_id)
    let op: { id: string } | null = did.length >= 5 ? (ops.find(o => !usedOps.has(o.id) && o.nref.includes(did)) ?? null) : null
    // 2) Fallback: monto exacto + fecha cercana (±7 días), el más cercano en fecha.
    if (!op) {
      const cands = ops.filter(o => !usedOps.has(o.id) && Math.abs(o.val - amt) < 0.01 && dayDiff(o.txn_date, r.date ?? null) <= 7)
        .sort((a, b) => dayDiff(a.txn_date, r.date ?? null) - dayDiff(b.txn_date, r.date ?? null))
      op = cands[0] ?? null
    }
    if (op) usedOps.add(op.id)
    plan.push({ row: r, op, already: false })
  }
  const already = plan.filter(p => p.already).length
  const nuevos = plan.filter(p => p.op && !p.already).length
  const sinCruce = plan.filter(p => !p.op).length

  // PREVIEW: no escribe nada
  if (!b?.commit) {
    return NextResponse.json({
      preview: true, total: rows.length, already, matched: nuevos, unmatched: sinCruce, repetidas,
      sample: plan.slice(0, 6).map(p => ({ disbursement_id: p.row.disbursement_id, date: p.row.date, amount: Number(p.row.amount), estado: p.already ? 'ya conciliado' : p.op ? 'cruza (nuevo)' : 'sin cruce' })),
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
    // Antes, CUALQUIER fallo aquí se anunciaba como "falta correr la
    // migración". Es cierto solo cuando la tabla no existe; en los demás casos
    // mandaba a buscar donde no era. Se distingue por el mensaje de Postgres.
    if (error) {
      const falta = /does not exist|schema cache|relation .* does not exist/i.test(String(error.message))
      return NextResponse.json({
        error: falta ? `Falta correr flywire_disbursements.sql: ${error.message}` : `No se pudo guardar: ${error.message}`,
        imported,
      }, { status: 400 })
    }
    imported += Math.min(200, disbRows.length - i)
  }
  // Marcar como conciliadas SOLO las operaciones cruzadas NUEVAS (las ya
  // conciliadas antes ya tienen su enlace).
  for (const p of plan) {
    if (!p.op || p.already) continue
    await sb.from('books_operations').update({
      flywire_disbursement_id: String(p.row.disbursement_id),
      gestion_status: 'conciliada',
      gestion_note: `Desembolso Flywire ${p.row.disbursement_id}${p.row.date ? ` (${p.row.date})` : ''}`,
      gestion_by: user.email ?? user.id, gestion_at: now,
    }).eq('id', p.op.id)
  }

  return NextResponse.json({ ok: true, imported, already, matched: nuevos, unmatched: sinCruce })
}
