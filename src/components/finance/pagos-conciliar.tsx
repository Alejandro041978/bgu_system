'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Link2, CircleSlash, CheckCircle2 } from 'lucide-react'

interface Candidate { external_id: string; amount: number; due_date: string | null }
interface Row {
  id: string; reference: string; source: string; amount: number; paid_date: string | null
  student: string | null; document: string | null; candidates: Candidate[]
}

const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')
const fmt = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function PagosConciliar() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    const d = await fetch('/api/finance/pagos-conciliar').then(r => r.json())
    if (!d.error) setRows(d.rows ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function act(row: Row, body: object, okText: string) {
    setBusy(row.id); setNotice(null)
    const d = await fetch('/api/finance/pagos-conciliar', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id: row.id, ...body }),
    }).then(r => r.json())
    setBusy(null)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: okText })
    load()
  }

  if (rows === null) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-4">
      {notice && (
        <p className={`text-sm px-3 py-2 rounded-lg ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>
      )}

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-14 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Bandeja vacía: todos los pagos tienen su cuota (o quedaron marcados sin cuota a propósito).</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">{rows.length} pago{rows.length === 1 ? '' : 's'} por conciliar</p>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Pago</th>
                    <th className="text-left px-3 py-3">Estudiante</th>
                    <th className="text-right px-3 py-3">Monto</th>
                    <th className="text-left px-3 py-3">Fecha</th>
                    <th className="text-left px-3 py-3">Cuota destino</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-gray-600">{r.reference}</span>
                        <span className="ml-1.5 bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">{r.source}</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">
                        {r.student ?? <span className="text-red-500 text-xs">sin estudiante</span>}
                        {r.document && <span className="text-xs text-gray-400"> · {r.document}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">{fmt(r.amount)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{fdate(r.paid_date)}</td>
                      <td className="px-3 py-2.5">
                        {r.candidates.length === 0 ? (
                          <span className="text-xs text-gray-400">sin cuotas impagas</span>
                        ) : (
                          <select value={choice[r.id] ?? ''} onChange={e => setChoice(p => ({ ...p, [r.id]: e.target.value }))}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[260px]">
                            <option value="">Elegir cuota…</option>
                            {r.candidates.map(c => (
                              <option key={c.external_id} value={c.external_id}>
                                {fmt(c.amount)} — vence {fdate(c.due_date)}{Math.abs(c.amount - r.amount) < 0.01 ? ' ✓ mismo monto' : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => act(r, { charge_external_id: choice[r.id] }, 'Pago enlazado a su cuota')}
                          disabled={busy === r.id || !choice[r.id]}
                          className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-[11px] px-2.5 py-1 rounded-lg mr-1.5">
                          {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />} Enlazar
                        </button>
                        <button onClick={() => { if (confirm('¿Marcar este pago como "sin cuota" (adelanto/pago libre)? Sale de la bandeja.')) act(r, { no_charge: true }, 'Marcado sin cuota') }}
                          disabled={busy === r.id}
                          className="inline-flex items-center gap-1 border border-gray-200 hover:border-gray-300 text-gray-500 text-[11px] px-2.5 py-1 rounded-lg">
                          <CircleSlash className="w-3 h-3" /> Sin cuota
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p className="text-[11px] text-gray-400">
        Aquí caen los pagos importados que no calzaron con ninguna cuota por monto exacto. Enlazar marca la cuota como pagada en el estado de cuenta; &quot;Sin cuota&quot; es para adelantos o pagos libres. La bandeja se vaciará sola cuando todos los pagos entren por el botón Flywire del estado de cuenta (llegan con su cuota de origen).
      </p>
    </div>
  )
}
