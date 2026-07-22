'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Link2, CircleSlash, CheckCircle2 } from 'lucide-react'

interface Candidate { external_id: string; amount: number; balance?: number; due_date: string | null }
interface Row {
  id: string; reference: string; source: string; amount: number; paid_date: string | null
  student: string | null; document: string | null; candidates: Candidate[]
}
interface SinRegistrar {
  reference: string; status: string; name: string; dni: string | null
  amount: number; method: string | null; fecha: string | null
}
interface Found { id: string; name: string; document_number: string | null }

const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')
const fmt = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Reembolsos Flywire (pestaña Reembolsos del portal ZBL): se registran como
// pago NEGATIVO espejo del original — el saldo de la cuota revive solo.
function RefundForm({ onDone, onError }: { onDone: (msg: string) => void; onError: (msg: string) => void }) {
  const [open, setOpen] = useState(false)
  const [ref, setRef] = useState('')
  const [refundId, setRefundId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    const d = await fetch('/api/finance/refunds', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flywire_ref: ref, refund_id: refundId, amount: Number(amount), refund_date: date }),
    }).then(r => r.json())
    setSaving(false)
    if (d.error) { onError(d.error); return }
    onDone(`Reembolso registrado: ${d.estudiante} por $${Math.abs(d.monto).toFixed(2)}${d.cuota_revivida ? ' (la cuota vuelve a quedar pendiente)' : ''}`)
    setRef(''); setRefundId(''); setAmount(''); setDate(''); setOpen(false)
  }

  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50">
        <div>
          <p className="text-sm font-medium text-gray-700">↩ Registrar reembolso Flywire</p>
          <p className="text-[11px] text-gray-400">Pestaña Reembolsos del portal ZBL — se registra como pago negativo espejo del original</p>
        </div>
        <span className="text-gray-400 text-xs">{open ? 'cerrar' : 'abrir'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
          <label>
            <span className="block text-xs text-gray-500 mb-1">Referencia del pago (ZBL…)</span>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="ZBL436762277" className={`${inp} w-44`} />
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">ID de reembolso (RZBL…)</span>
            <input value={refundId} onChange={e => setRefundId(e.target.value)} placeholder="RZBLC6A0B28E" className={`${inp} w-44`} />
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">Monto (USD)</span>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="120.00" className={`${inp} w-28`} />
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">Fecha del reembolso</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
          </label>
          <button onClick={submit} disabled={saving || !ref.trim() || !refundId.trim() || !amount || !date}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40">
            {saving ? 'Registrando…' : 'Registrar reembolso'}
          </button>
        </div>
      )}
    </div>
  )
}

export function PagosConciliar() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [sinRegistrar, setSinRegistrar] = useState<SinRegistrar[]>([])
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  // Búsqueda de estudiante por fila de "sin registrar" + elección de cuota destino
  const [query, setQuery] = useState<Record<string, string>>({})
  const [found, setFound] = useState<Record<string, Found[]>>({})
  const [sel, setSel] = useState<Record<string, Found | null>>({})
  const [cuotas, setCuotas] = useState<Record<string, Candidate[]>>({})
  const [cuotaChoice, setCuotaChoice] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const d = await fetch('/api/finance/pagos-conciliar').then(r => r.json())
    if (!d.error) { setRows(d.rows ?? []); setSinRegistrar(d.sin_registrar ?? []) }
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

  async function actFly(ref: string, body: object, okText: string) {
    setBusy(ref); setNotice(null)
    const d = await fetch('/api/finance/pagos-conciliar', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flywire_ref: ref, ...body }),
    }).then(r => r.json())
    setBusy(null)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: okText })
    load()
  }

  async function buscar(ref: string) {
    const q = (query[ref] ?? '').trim()
    if (q.length < 2) return
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(q)}`).then(r => r.json())
    setFound(prev => ({ ...prev, [ref]: d.students ?? [] }))
  }

  // Paso 2 del registro: elegido el estudiante, se cargan sus cuotas abiertas
  // para que el humano decida el destino (o "sin cuota" a la bandeja).
  async function elegir(ref: string, f: Found, amount: number) {
    setSel(prev => ({ ...prev, [ref]: f }))
    const d = await fetch(`/api/finance/pagos-conciliar?cuotas_de=${f.id}`).then(r => r.json())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: Candidate[] = (d.cuotas ?? []).map((c: any) => ({
      external_id: c.external_id, amount: Number(c.amount), due_date: c.due_date,
      balance: Math.round((Number(c.amount) - Number(c.pagado ?? 0)) * 100) / 100,
    }))
    setCuotas(prev => ({ ...prev, [ref]: list }))
    // Preselección: la cuota cuyo SALDO calza exacto con el pago, si existe
    const match = list.find(c => Math.abs((c.balance ?? c.amount) - amount) < 0.01)
    setCuotaChoice(prev => ({ ...prev, [ref]: match?.external_id ?? 'none' }))
  }

  if (rows === null) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-4">
      {notice && (
        <p className={`text-sm px-3 py-2 rounded-lg ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>
      )}

      <RefundForm onDone={msg => { setNotice({ kind: 'ok', text: msg }); load() }} onError={msg => setNotice({ kind: 'error', text: msg })} />

      {/* Sección: pagos entregados en Flywire que no existen como pago en el ERP */}
      {sinRegistrar.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-amber-50/60 border-b border-amber-100">
            <p className="text-sm font-medium text-amber-800">Pagos Flywire sin registrar ({sinRegistrar.length})</p>
            <p className="text-[11px] text-amber-600">Entregados en Flywire pero sin pago en el ERP: sin estudiante identificado o excluidos al importar. Asigna el estudiante y regístralo, o descártalo (pruebas, pagadores externos).</p>
          </div>
          <div className="divide-y divide-gray-50">
            {sinRegistrar.map(r => (
              <div key={r.reference} className="px-4 py-3 space-y-2">
                <div className="flex items-center flex-wrap gap-2 text-sm">
                  <span className="font-mono text-xs text-gray-500">{r.reference}</span>
                  <span className="text-gray-800">{r.name}</span>
                  {r.dni && <span className="text-xs text-gray-400">DNI: {r.dni}</span>}
                  <span className="font-medium tabular-nums ml-auto">{fmt(r.amount)}</span>
                  <span className="text-xs text-gray-500">{fdate(r.fecha)}</span>
                  <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">{r.method ?? r.status}</span>
                </div>
                <div className="flex items-center flex-wrap gap-1.5">
                  <input value={query[r.reference] ?? ''} onChange={e => setQuery(p => ({ ...p, [r.reference]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') buscar(r.reference) }}
                    placeholder="Buscar estudiante…"
                    className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={() => buscar(r.reference)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Buscar</button>
                  {(found[r.reference] ?? []).map(f => (
                    <button key={f.id} onClick={() => elegir(r.reference, f, r.amount)}
                      disabled={busy === r.reference}
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border ${sel[r.reference]?.id === f.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-100'}`}>
                      <Link2 className="w-3 h-3" /> {f.name} {f.document_number ? `(${f.document_number})` : ''}
                    </button>
                  ))}
                  <button onClick={() => { if (confirm(`¿Descartar ${r.reference} (${r.name})? No se registrará como pago.`)) actFly(r.reference, { dismiss: true }, 'Referencia descartada') }}
                    disabled={busy === r.reference}
                    className="inline-flex items-center gap-1 border border-gray-200 hover:border-gray-300 text-gray-500 text-[11px] px-2 py-1 rounded-lg ml-auto">
                    <CircleSlash className="w-3 h-3" /> Descartar
                  </button>
                </div>
                {/* Paso 2: destino del pago — cuota abierta elegida o "sin cuota" */}
                {sel[r.reference] && (
                  <div className="flex items-center flex-wrap gap-1.5 pl-1">
                    <span className="text-[11px] text-gray-500">Destino para <b>{sel[r.reference]!.name}</b>:</span>
                    <select value={cuotaChoice[r.reference] ?? 'none'}
                      onChange={e => setCuotaChoice(p => ({ ...p, [r.reference]: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="none">Sin cuota (queda en la bandeja de abajo)</option>
                      {(cuotas[r.reference] ?? []).map(c => {
                        const saldo = c.balance ?? c.amount
                        const parcial = saldo < c.amount - 0.01
                        return (
                          <option key={c.external_id} value={c.external_id}>
                            Cuota {parcial ? `saldo ${fmt(saldo)} de ${fmt(c.amount)}` : fmt(c.amount)}{c.due_date ? ` · vence ${fdate(c.due_date)}` : ''}
                          </option>
                        )
                      })}
                    </select>
                    {(cuotas[r.reference] ?? []).length === 0 && (
                      <span className="text-[11px] text-amber-600">sin cuotas abiertas — quedará como pago sin cuota</span>
                    )}
                    <button
                      onClick={() => {
                        const choice = cuotaChoice[r.reference] ?? 'none'
                        actFly(r.reference, {
                          student_id: sel[r.reference]!.id,
                          ...(choice === 'none' ? { no_link: true } : { charge_external_id: choice }),
                        }, `Pago ${r.reference} registrado para ${sel[r.reference]!.name}${choice === 'none' ? ' (sin cuota, a la bandeja)' : ' y enlazado a su cuota'}`)
                      }}
                      disabled={busy === r.reference}
                      className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] px-2.5 py-1 rounded-lg">
                      {busy === r.reference ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Registrar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
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
                            {r.candidates.map(c => {
                              const saldo = c.balance ?? c.amount
                              const parcial = saldo < c.amount - 0.01
                              return (
                                <option key={c.external_id} value={c.external_id}>
                                  {parcial ? `saldo ${fmt(saldo)} de ${fmt(c.amount)}` : fmt(c.amount)} — vence {fdate(c.due_date)}{Math.abs(saldo - r.amount) < 0.01 ? ' ✓ mismo monto' : ''}
                                </option>
                              )
                            })}
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
