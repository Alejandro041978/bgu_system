'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Pencil, CheckCircle2 } from 'lucide-react'

interface Op {
  id: string; account_name: string; txn_date: string | null; txn_type: string | null
  reference: string | null; contact_name: string | null; description: string | null
  debit: number | null; credit: number | null; amount: number | null
  gestion_status: string; gestion_note: string | null; gestion_by: string | null
}

const money = (n: number | null) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

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

  const load = useCallback(async (a: string, s: string) => {
    setLoading(true)
    const d = await fetch(`/api/finance/books/operations?${a ? `account=${encodeURIComponent(a)}&` : ''}${s ? `status=${s}` : ''}`).then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setOps(d.operations ?? []); setCuentas(d.cuentas ?? []); setLoading(false)
  }, [])
  useEffect(() => { load(account, status) }, [account, status, load])

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

  const pendientes = ops.filter(o => o.gestion_status === 'pendiente').length

  return (
    <div className="space-y-5">
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
            <option value="gestionada">Gestionada</option>
          </select>
        </label>
        <div className="ml-auto flex items-end gap-2">
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

      {!loading && <p className="text-xs text-gray-500">{ops.length} operación(es) · {pendientes} pendiente(s) de gestión</p>}

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
                <tr key={o.id} className={o.gestion_status === 'gestionada' ? 'opacity-60' : 'hover:bg-gray-50/50'}>
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
                      className={`inline-flex items-center gap-1 text-xs rounded-lg px-2 py-1 border ${o.gestion_status === 'gestionada' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                      {o.gestion_status === 'gestionada' && <CheckCircle2 className="w-3 h-3" />}
                      {o.gestion_status}
                    </button>
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
    </div>
  )
}
