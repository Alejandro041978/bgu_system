'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, PiggyBank, CheckCircle2, XCircle, Clock } from 'lucide-react'

interface Solicitud {
  id: string; student_id: string; nombre: string; documento: string | null; email: string | null
  months: number; discount_pct: number; gross_amount: number; discount_amount: number; net_amount: number
  status: string; requested_at: string; expires_at: string | null; review_note: string | null
  charges: string[]
}

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export function CashpayRequests() {
  const [rows, setRows] = useState<Solicitud[]>([])
  const [status, setStatus] = useState('pendiente')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const load = useCallback(async (s: string) => {
    setLoading(true)
    const j = await fetch(`/api/finance/cashpay?status=${s}`).then(r => r.json()).catch(() => null)
    if (j?.error) setError(j.error); else setRows(j?.solicitudes ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load(status) }, [status, load])

  async function decidir(r: Solicitud, action: 'aprobar' | 'rechazar') {
    const note = action === 'rechazar' ? (prompt('Motivo del rechazo (opcional):') ?? '') : ''
    if (action === 'aprobar' && !confirm(`¿Aprobar el beneficio de ${r.nombre}?\n\nSe aplicará ${r.discount_pct}% de descuento (${money(r.discount_amount)}) en sus cuotas. Pagará ${money(r.net_amount)}.`)) return
    setBusy(r.id); setError(null); setOk(null)
    const j = await fetch('/api/finance/cashpay', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action, note }),
    }).then(x => x.json())
    setBusy(null)
    if (j.error) { setError(j.error); return }
    setOk(action === 'aprobar'
      ? `Aprobado: descuento de ${money(j.descuento)} aplicado en ${j.cuotas} cuota(s). ${r.nombre} pagará ${money(j.neto)}.`
      : `Solicitud de ${r.nombre} rechazada.`)
    load(status)
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span>{error}</span><button onClick={() => setError(null)}>✕</button></div>}
      {ok && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span>{ok}</span><button onClick={() => setOk(null)}>✕</button></div>}

      <div className="flex items-center gap-2">
        {[['pendiente', 'Pendientes'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas'], ['todas', 'Todas']].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${status === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
        ))}
      </div>

      {loading ? <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div> : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{r.nombre}</p>
                  <p className="text-[11px] text-gray-400 font-mono">{r.documento ?? r.email}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Adelanta <b>{r.charges?.length ?? 0}</b> cuota(s) · <b>{r.months}</b> meses de anticipación · solicitado {fdate(r.requested_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-emerald-600 tabular-nums">−{money(r.discount_amount)}</p>
                  <p className="text-[11px] text-gray-500">{r.discount_pct}% de descuento</p>
                </div>
              </div>
              <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100 flex items-center gap-5 text-xs text-gray-600 flex-wrap">
                <span>Normal: <span className="line-through">{money(r.gross_amount)}</span></span>
                <span className="font-semibold text-gray-900">Pagaría: {money(r.net_amount)}</span>
                {r.expires_at && <span className="text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />vence {fdate(r.expires_at)}</span>}
                {r.status === 'pendiente' ? (
                  <span className="ml-auto flex items-center gap-2">
                    {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : (
                      <>
                        <button onClick={() => decidir(r, 'rechazar')} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800"><XCircle className="w-3.5 h-3.5" />Rechazar</button>
                        <button onClick={() => decidir(r, 'aprobar')} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" />Aprobar y aplicar</button>
                      </>
                    )}
                  </span>
                ) : (
                  <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full border ${r.status === 'aprobada' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>{r.status}</span>
                )}
              </div>
              {r.review_note && <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-100">Nota: {r.review_note}</p>}
            </div>
          ))}
          {rows.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl py-12 text-center">
              <PiggyBank className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Sin solicitudes {status !== 'todas' ? status + 's' : ''}.</p>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Al aprobar se aplica el descuento como filas serie DESCUENTO prorrateadas por cuota (trazable y reversible, igual que cualquier otro descuento).
        El saldo se recalcula al momento de aprobar: si el estudiante ya pagó alguna cuota, esa no se descuenta.
      </p>
    </div>
  )
}
