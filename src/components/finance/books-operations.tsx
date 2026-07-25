'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Pencil, CheckCircle2, Upload, Link2, Search, UserPlus, X } from 'lucide-react'

interface Op {
  id: string; account_name: string; txn_date: string | null; txn_type: string | null
  reference: string | null; contact_name: string | null; description: string | null
  debit: number | null; credit: number | null; amount: number | null
  gestion_status: string; gestion_note: string | null; gestion_by: string | null
}
interface Hit { id: string; name: string; document_number: string | null }
interface Cuota { external_id: string; program_name: string; concept: string; concept_name: string; amount: number; balance: number; due_date: string | null; status: string }
interface Sug { operation_id: string; date: string | null; amount: number; diff: number }
interface Disb { id: string; disbursement_id: string; disbursement_date: string | null; amount: number; currency: string | null; matched_operation_id: string | null; suggestion?: Sug | null }
interface DisbRow { disbursement_id: string; date: string | null; amount: number; currency: string | null; count: number | null }
interface Preview { total: number; already: number; matched: number; unmatched: number; sample: { disbursement_id: string; date: string | null; amount: number; estado: string }[]; cols: string }

const money = (n: number | null) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

// CSV → matriz (respeta comillas)
function parseCsv(text: string): string[][] {
  return text.split(/\r?\n/).filter(l => l.trim()).map(line => {
    const out: string[] = []; let cur = '', q = false
    for (const ch of line) {
      if (ch === '"') q = !q
      else if (ch === ',' && !q) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur); return out.map(s => s.trim().replace(/^"|"$/g, ''))
  })
}
const num = (s: string) => Number(String(s ?? '').replace(/[^\d.-]/g, '')) || 0
// DD/MM/YYYY → YYYY-MM-DD (el reporte de Flywire viene en formato peruano)
function toIso(s: string): string | null {
  const raw = String(s ?? '').trim()
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : (raw || null)
}
// Detección flexible de columnas del reporte de desembolsos de Flywire
// (incluye los encabezados en español: fecha, codigo, cantidad, monto).
function detectCols(header: string[]) {
  const find = (cands: string[]) => header.findIndex(h => cands.some(c => h.toLowerCase().includes(c)))
  return {
    id: find(['disbursement id', 'payout id', 'settlement id', 'disbursement', 'payout', 'settlement', 'codigo', 'código', 'code', 'reference', 'id']),
    date: find(['disbursement date', 'payout date', 'value date', 'settlement date', 'fecha', 'date']),
    amount: find(['disbursement amount', 'net amount', 'payout amount', 'monto', 'importe', 'amount', 'total', 'net']),
    currency: find(['currency', 'moneda']),
    count: find(['cantidad', 'count', 'payments', 'transfers']),
  }
}

export function BooksOperations() {
  const [ops, setOps] = useState<Op[]>([])
  const [cuentas, setCuentas] = useState<string[]>([])
  const [account, setAccount] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))

  // Desembolsos Flywire
  const [disb, setDisb] = useState<Disb[]>([])
  const [parsed, setParsed] = useState<DisbRow[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Asociar ingreso de Books → cuota de estudiante (crea pago serie BOOKS)
  const [assocOp, setAssocOp] = useState<Op | null>(null)
  const [aq, setAq] = useState('')
  const [aHits, setAHits] = useState<Hit[]>([])
  const [aStudent, setAStudent] = useState<Hit | null>(null)
  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [alloc, setAlloc] = useState<Record<string, string>>({})  // charge_external_id → monto
  const [associating, setAssociating] = useState(false)

  const load = useCallback(async (a: string, s: string) => {
    setLoading(true)
    const d = await fetch(`/api/finance/books/operations?${a ? `account=${encodeURIComponent(a)}&` : ''}${s ? `status=${s}` : ''}`).then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setOps(d.operations ?? []); setCuentas(d.cuentas ?? []); setLoading(false)
  }, [])
  const loadDisb = useCallback(async () => {
    const d = await fetch('/api/finance/flywire-disbursements').then(r => r.json()).catch(() => null)
    if (d && !d.error) setDisb(d.disbursements ?? [])
  }, [])
  useEffect(() => { load(account, status) }, [account, status, load])
  useEffect(() => { loadDisb() }, [loadDisb])

  async function sync() {
    setSyncing(true); setError(null)
    const d = await fetch('/api/finance/books/operations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_date: from, to_date: to }),
    }).then(r => r.json())
    setSyncing(false)
    if (d.error) { setError(d.error); return }
    load(account, status)
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const d = await fetch('/api/finance/books/operations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load(account, status)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setError(null); setPreview(null); setParsed([])
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) { setError('CSV vacío o sin filas'); return }
    const header = rows[0]
    const c = detectCols(header)
    if (c.amount < 0 || c.id < 0) { setError(`No pude detectar las columnas (id / monto). Encabezados: ${header.join(' | ')}`); return }
    const drows: DisbRow[] = rows.slice(1).map(r => ({
      disbursement_id: r[c.id] ?? '', date: c.date >= 0 ? toIso(r[c.date]) : null,
      amount: num(r[c.amount]), currency: c.currency >= 0 ? (r[c.currency] || null) : null,
      count: c.count >= 0 ? (num(r[c.count]) || null) : null,
    })).filter(r => r.disbursement_id && r.amount)
    setParsed(drows)
    // Preview (sin escribir)
    const cols = `id="${header[c.id]}" · monto="${header[c.amount]}" · fecha="${c.date >= 0 ? header[c.date] : '(no detectada)'}"`
    const d = await fetch('/api/finance/flywire-disbursements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: drows }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    setPreview({ ...d, cols })
  }

  // --- Asociación a cuota de estudiante ---
  useEffect(() => {
    if (!assocOp || aStudent || aq.trim().length < 2) { setAHits([]); return }
    const t = setTimeout(async () => {
      const d = await fetch(`/api/students/search?q=${encodeURIComponent(aq.trim())}`).then(r => r.json()).catch(() => ({ students: [] }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAHits((d.students ?? []).slice(0, 8).map((s: any) => ({ id: s.id, name: s.name ?? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '), document_number: s.document_number ?? null })))
    }, 300)
    return () => clearTimeout(t)
  }, [aq, aStudent, assocOp])

  async function pickAStudent(h: Hit) {
    setAStudent(h); setAq(h.name); setAHits([]); setAlloc({})
    const d = await fetch(`/api/finance/books/associate?student=${h.id}`).then(r => r.json())
    setCuotas(d.cuotas ?? [])
  }
  // Marca/desmarca una cuota para el reparto; al marcar, sugiere el saldo (o lo que
  // reste del ingreso, lo que sea menor) para no pasarse.
  function toggleCuota(c: Cuota) {
    setAlloc(prev => {
      const next = { ...prev }
      if (next[c.external_id] != null) { delete next[c.external_id]; return next }
      const asignado = Object.values(prev).reduce((s, v) => s + (Number(v) || 0), 0)
      const restante = Math.max(0, (assocOp?.credit ?? 0) - asignado)
      const base = c.balance > 0 ? c.balance : c.amount
      const sugerido = Math.min(base, restante || base)
      next[c.external_id] = (Math.round(sugerido * 100) / 100).toString()
      return next
    })
  }
  const asignadoTotal = Math.round(Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100
  async function doAssociate() {
    if (!assocOp) return
    const allocations = Object.entries(alloc)
      .map(([charge_external_id, v]) => ({ charge_external_id, amount: Number(v) }))
      .filter(a => a.amount > 0)
    if (!allocations.length) { setError('Selecciona al menos una cuota y un monto'); return }
    setAssociating(true); setError(null)
    const d = await fetch('/api/finance/books/associate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation_id: assocOp.id, allocations }),
    }).then(r => r.json())
    setAssociating(false)
    if (d.error) { setError(d.error); return }
    setAssocOp(null); setAStudent(null); setAq(''); setCuotas([]); setAlloc({})
    load(account, status)
  }
  // Desasocia una operación ya conciliada (borra sus pagos Books) para rehacerla.
  async function desasociar(op: Op) {
    if (!confirm(`¿Desasociar el ingreso de Books (${money(op.credit)})? Se borrarán los pagos BOOKS que creó y la operación volverá a "pendiente".`)) return
    setError(null)
    const d = await fetch('/api/finance/books/associate', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation_id: op.id }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load(account, status)
  }

  async function associate(disbursement_id: string, operation_id: string) {
    const d = await fetch('/api/finance/flywire-disbursements', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disbursement_id, operation_id }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load(account, status); loadDisb()
  }

  async function confirmImport() {
    setImporting(true); setError(null)
    const d = await fetch('/api/finance/flywire-disbursements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: parsed, commit: true }),
    }).then(r => r.json())
    setImporting(false)
    if (d.error) { setError(d.error); return }
    setPreview(null); setParsed([])
    load(account, status); loadDisb()
  }

  const pendientes = ops.filter(o => o.gestion_status === 'pendiente').length
  const disbUnmatched = disb.filter(d => !d.matched_operation_id)

  const STATUS_CLS: Record<string, string> = {
    gestionada: 'bg-green-50 border-green-200 text-green-700',
    asociada: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    conciliada: 'bg-blue-50 border-blue-200 text-blue-700',
    pendiente: 'bg-amber-50 border-amber-200 text-amber-700',
  }

  return (
    <div className="space-y-5">
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span className="break-all">{error}</span><button onClick={() => setError(null)}>✕</button></div>}

      <div className="flex items-end gap-3 flex-wrap">
        <label className="block"><span className="block text-xs text-gray-500 mb-1">Cuenta</span>
          <select value={account} onChange={e => setAccount(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Todas</option>
            {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block"><span className="block text-xs text-gray-500 mb-1">Estado</span>
          <select value={status} onChange={e => setStatus(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="conciliada">Conciliada (desembolso)</option>
            <option value="gestionada">Gestionada</option>
          </select>
        </label>
        <div className="ml-auto flex items-end gap-2">
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">
            <Upload className="w-4 h-4" />Importar desembolsos de Flywire
          </button>
          <label className="block"><span className="block text-xs text-gray-500 mb-1">Desde</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-2 text-xs" />
          </label>
          <label className="block"><span className="block text-xs text-gray-500 mb-1">Hasta</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-2 text-xs" />
          </label>
          <button onClick={sync} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sincronizar desde Books
          </button>
        </div>
      </div>

      {/* Preview de importación de desembolsos */}
      {preview && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Link2 className="w-4 h-4 text-blue-600" />Vista previa — desembolsos de Flywire</p>
          <p className="text-xs text-gray-500">Columnas detectadas: <span className="font-mono">{preview.cols}</span></p>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 tabular-nums">{preview.total} desembolso(s)</span>
            {preview.already > 0 && <span className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 tabular-nums">{preview.already} ya conciliados</span>}
            <span className="px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 tabular-nums">{preview.matched} cruzan (nuevos)</span>
            <span className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 tabular-nums">{preview.unmatched} sin cruce</span>
          </div>
          <div className="text-xs text-gray-500">
            {preview.sample.map((s, i) => (
              <div key={i} className="flex gap-3"><span className="font-mono w-40 truncate">{s.disbursement_id}</span><span className="w-24">{s.date ?? '—'}</span><span className="w-24 text-right tabular-nums">{money(s.amount)}</span><span className={s.estado === 'sin cruce' ? 'text-amber-600' : s.estado === 'ya conciliado' ? 'text-blue-600' : 'text-green-600'}>{s.estado}</span></div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">Si las columnas detectadas están mal, no confirmes y avísame el encabezado del CSV.</p>
          <div className="flex gap-2">
            <button onClick={confirmImport} disabled={importing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Importar y cruzar
            </button>
            <button onClick={() => { setPreview(null); setParsed([]) }} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
          </div>
        </div>
      )}

      {!loading && <p className="text-xs text-gray-500">{ops.length} operación(es) · {pendientes} pendiente(s) de gestión · {disb.length} desembolso(s) Flywire importado(s)</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Cuenta</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Contacto</th>
                <th className="px-3 py-2 text-left">Referencia</th>
                <th className="px-3 py-2 text-right">Débito</th>
                <th className="px-3 py-2 text-right">Crédito</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ops.map(o => (
                <tr key={o.id} className={o.gestion_status !== 'pendiente' ? 'opacity-60' : 'hover:bg-gray-50/50'}>
                  <td className="px-3 py-2 text-xs text-gray-500">{o.txn_date ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${/return/i.test(o.account_name) ? 'bg-red-50 text-red-700' : /corporate/i.test(o.account_name) ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>{o.account_name}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{o.txn_type ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-700 max-w-52 truncate" title={o.contact_name ?? ''}>{o.contact_name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{o.reference ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">{money(o.debit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-green-600">{money(o.credit)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => patch(o.id, { gestion_status: o.gestion_status === 'pendiente' ? 'gestionada' : 'pendiente' })}
                      className={`inline-flex items-center gap-1 text-xs rounded-lg px-2 py-1 border ${STATUS_CLS[o.gestion_status] ?? STATUS_CLS.pendiente}`}>
                      {o.gestion_status !== 'pendiente' && <CheckCircle2 className="w-3 h-3" />}
                      {o.gestion_status}
                    </button>
                    {o.gestion_status === 'pendiente' && (o.credit ?? 0) > 0 && (
                      <button onClick={() => { setAssocOp(o); setAq(''); setAHits([]); setAStudent(null); setCuotas([]); setAlloc({}) }}
                        className="block mt-1 text-[10px] text-blue-600 hover:underline">→ asociar a cuota(s)</button>
                    )}
                    {o.gestion_status === 'asociada' && (
                      <button onClick={() => desasociar(o)}
                        className="block mt-1 text-[10px] text-red-500 hover:underline">✕ desasociar</button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5 max-w-56">
                      <span className="truncate" title={o.gestion_note ?? ''}>{o.gestion_note ?? '—'}</span>
                      <button onClick={() => { const n = prompt('Nota de gestión:', o.gestion_note ?? ''); if (n !== null) patch(o.id, { gestion_note: n }) }}
                        className="text-gray-300 hover:text-blue-600"><Pencil className="w-3 h-3" /></button>
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && ops.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-gray-400">Sin operaciones. Usa &quot;Sincronizar desde Books&quot; para traerlas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Desembolsos de Flywire SIN cruce en Books */}
      {disbUnmatched.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <p className="text-sm font-semibold text-amber-800">Desembolsos de Flywire sin cruce en Books ({disbUnmatched.length})</p>
            <span className="text-xs text-amber-600">Flywire abonó pero no aparece un depósito equivalente en Zoho Books — revisar.</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-4 py-2 text-left">Desembolso (Flywire)</th>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-right">Monto</th>
                <th className="px-4 py-2 text-left">Sugerencia en Books (por fecha)</th>
                <th className="px-4 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {disbUnmatched.map(d => (
                <tr key={d.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-700">{d.disbursement_id}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{d.disbursement_date ?? '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-700">{money(d.amount)}</td>
                  <td className="px-4 py-2 text-xs">
                    {d.suggestion ? (
                      <span className="text-gray-600">Books {d.suggestion.date} · <span className="tabular-nums">{money(d.suggestion.amount)}</span>
                        {d.suggestion.diff !== 0 && <span className={`ml-1 ${Math.abs(d.suggestion.diff) <= 150 ? 'text-amber-600' : 'text-red-600'}`}>· dif {money(d.suggestion.diff)}</span>}
                      </span>
                    ) : <span className="text-gray-300">sin candidato cercano</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {d.suggestion && (
                      <button onClick={() => { if (confirm(`¿Asociar el desembolso ${d.disbursement_id} (${money(d.amount)}) con el depósito de Books del ${d.suggestion!.date} (${money(d.suggestion!.amount)})? Diferencia ${money(d.suggestion!.diff)} (comisión).`)) associate(d.disbursement_id, d.suggestion!.operation_id) }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                        <Link2 className="w-3.5 h-3.5" />Asociar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: asociar un ingreso de Books a una cuota de estudiante */}
      {assocOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !associating && setAssocOp(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-blue-600" />Asociar ingreso de Books a una cuota</h3>
              <button onClick={() => setAssocOp(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              <b className="text-gray-700">{money(assocOp.credit)}</b> · {assocOp.txn_date} · {assocOp.account_name} · {assocOp.contact_name ?? '—'} · ref {assocOp.reference ?? '—'}
            </div>

            {!aStudent ? (
              <div className="relative">
                <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input value={aq} onChange={e => setAq(e.target.value)} placeholder="Buscar estudiante (nombre o documento)…" className="flex-1 text-sm focus:outline-none" autoFocus />
                </div>
                {aHits.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-56 overflow-auto">
                    {aHits.map(h => (
                      <button key={h.id} onClick={() => pickAStudent(h)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">
                        {h.name} {h.document_number && <span className="text-gray-400 text-xs ml-1">{h.document_number}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-700 flex items-center gap-2">
                  {aStudent.name} <span className="text-xs text-gray-400">{aStudent.document_number}</span>
                  <button onClick={() => { setAStudent(null); setCuotas([]); setAq('') }} className="text-xs text-blue-600 hover:underline">cambiar</button>
                </p>
                <div className="border border-gray-100 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0"><tr className="bg-gray-50 text-gray-500 text-[10.5px] uppercase">
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left">Programa</th><th className="px-3 py-2 text-left">Concepto</th><th className="px-3 py-2 text-left">Vence</th>
                      <th className="px-3 py-2 text-right">Cuota</th><th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2 text-right">Asignar</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {cuotas.map(c => {
                        const sel = alloc[c.external_id] != null
                        const calza = Math.abs(c.balance - (assocOp.credit ?? 0)) < 0.01
                        return (
                          <tr key={c.external_id} className={sel ? 'bg-blue-50/50' : calza ? 'bg-green-50/40' : ''}>
                            <td className="px-3 py-1.5 text-center">
                              <input type="checkbox" checked={sel} onChange={() => toggleCuota(c)} className="accent-blue-600" />
                            </td>
                            <td className="px-3 py-1.5 text-xs text-gray-500 max-w-40 truncate" title={c.program_name}>{c.program_name}</td>
                            <td className="px-3 py-1.5 text-xs" title={c.concept_name}>{c.concept}</td>
                            <td className="px-3 py-1.5 text-xs text-gray-500">{c.due_date ?? '—'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-xs">{money(c.amount)}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums text-xs ${c.balance > 0.005 ? 'text-gray-900 font-medium' : 'text-green-600'}`}>{money(c.balance)}</td>
                            <td className="px-3 py-1.5 text-right">
                              {sel ? (
                                <input type="number" min={0} step="0.01" value={alloc[c.external_id]}
                                  onChange={e => setAlloc(prev => ({ ...prev, [c.external_id]: e.target.value }))}
                                  className="w-24 text-right text-xs border border-blue-200 rounded px-2 py-1 tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400" />
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                      {cuotas.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-gray-400">Este estudiante no tiene cuotas.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-gray-400 max-w-sm">Marca una o varias cuotas y reparte el ingreso (p. ej. enrollment + tuition en un mismo depósito). Se crea un pago serie BOOKS por cuota, sin unificarlas.</p>
                  <div className="text-right">
                    <p className={`text-xs tabular-nums ${asignadoTotal > (assocOp.credit ?? 0) + 0.01 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                      Asignado: <b>{money(asignadoTotal)}</b> / {money(assocOp.credit)}
                      {asignadoTotal > (assocOp.credit ?? 0) + 0.01 && <span className="ml-1">· supera el ingreso</span>}
                      {asignadoTotal < (assocOp.credit ?? 0) - 0.01 && asignadoTotal > 0 && <span className="ml-1 text-amber-600">· sobra {money((assocOp.credit ?? 0) - asignadoTotal)}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={doAssociate}
                    disabled={associating || asignadoTotal <= 0 || asignadoTotal > (assocOp.credit ?? 0) + 0.01}
                    className="inline-flex items-center gap-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-40">
                    {associating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}Asociar como pago(s) Books
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
