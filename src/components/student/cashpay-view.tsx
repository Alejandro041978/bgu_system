'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, PiggyBank, AlertTriangle, CheckCircle2, Clock, Wallet } from 'lucide-react'

interface Cuota { external_id: string; amount: number; balance: number; due_date: string; concepto: string | null }
interface Oferta {
  charges: string[]; cuotas: number; months: number
  discount_pct: number; gross: number; discount: number; net: number; hasta: string
}
interface Solicitud {
  id: string; status: string; months: number; discount_pct: number
  gross_amount: number; discount_amount: number; net_amount: number
  requested_at: string; expires_at: string | null; review_note: string | null
}
interface Data {
  elegible: boolean; motivo: string | null; overdue: number
  futuras: Cuota[]; oferta: Oferta | null
  settings: { monthly_rate: number; max_discount: number; quote_valid_days: number }
  solicitud: Solicitud | null
}

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fdate = (d: string | null) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'

export function CashpayView() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const j = await fetch('/api/student/cashpay').then(r => r.json()).catch(() => null)
    if (j && !j.error) setD(j)
    else setError(j?.error ?? 'No se pudo cargar')
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function solicitar() {
    setSending(true); setError(null); setOk(null)
    const j = await fetch('/api/student/cashpay', { method: 'POST' }).then(r => r.json())
    setSending(false)
    if (j.error) { setError(j.error); return }
    setOk(`Solicitud enviada. Un asesor la revisará y se comunicará contigo. Tu cotización vale hasta el ${fdate(j.expires_at)}.`)
    load()
  }

  if (loading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><PiggyBank className="w-5 h-5 text-emerald-600" />Cashpay · Adelanta y ahorra</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cancela de una sola vez <b>todas tus cuotas de pensión pendientes</b> y recibe un descuento por el
          tiempo que anticipas: <b>{d?.settings.monthly_rate ?? 0.8}% por cada mes</b> de anticipación, hasta un
          máximo de <b>{d?.settings.max_discount ?? 20}%</b>.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {ok && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{ok}</div>}

      {/* Solicitud en curso */}
      {d?.solicitud && (
        <div className={`rounded-xl p-5 border ${d.solicitud.status === 'aprobada' ? 'bg-green-50 border-green-200' : 'bg-indigo-50 border-indigo-200'}`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            {d.solicitud.status === 'aprobada' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-indigo-600" />}
            {d.solicitud.status === 'aprobada' ? 'Tu beneficio fue aprobado' : 'Tu solicitud está en revisión'}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {d.solicitud.discount_pct}% de descuento · ahorro {money(d.solicitud.discount_amount)} · a pagar <b>{money(d.solicitud.net_amount)}</b>
          </p>
          {d.solicitud.status === 'aprobada'
            ? <p className="text-xs text-green-700 mt-1">El descuento ya está aplicado en tu estado de cuenta. <Link href="/student/account" className="underline">Verlo</Link></p>
            : <p className="text-xs text-indigo-700 mt-1">Válida hasta el {fdate(d.solicitud.expires_at)}. Un asesor se comunicará contigo.</p>}
        </div>
      )}

      {/* No elegible */}
      {d && !d.elegible && !d.solicitud && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800"><AlertTriangle className="w-4 h-4" />{d.motivo}</p>
          {d.overdue > 0 && (
            <>
              <p className="text-sm text-amber-700 mt-1">Tienes <b>{money(d.overdue)}</b> en cuotas vencidas.</p>
              <Link href="/student/account" className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-900 underline mt-2">
                <Wallet className="w-4 h-4" /> Ver mi estado de cuenta
              </Link>
            </>
          )}
        </div>
      )}

      {/* La oferta: una sola, sin nada que elegir. */}
      {d?.elegible && d.oferta && !d.solicitud && (
        <>
          <div className="border border-emerald-300 bg-emerald-50/50 rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Tu beneficio</p>
            <div className="flex items-end justify-between gap-3 flex-wrap mt-1">
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{money(d.oferta.net)}</p>
                <p className="text-sm text-gray-500">
                  en lugar de <span className="line-through">{money(d.oferta.gross)}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-600 tabular-nums">−{money(d.oferta.discount)}</p>
                <p className="text-sm text-emerald-700">{d.oferta.discount_pct}% de descuento</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-emerald-200">
              Cancelas tus <b>{d.oferta.cuotas} cuota(s) de pensión</b> pendientes, hasta la del {fdate(d.oferta.hasta)}
              {' '}— <b>{d.oferta.months} meses</b> de anticipación. Quedas sin deuda de pensión hasta el final de tu plan.
            </p>
          </div>

          <button onClick={solicitar} disabled={sending}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold">
            {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : <>Solicitar este beneficio · ahorra {money(d.oferta.discount)}</>}
          </button>
          <p className="text-[11px] text-gray-400 text-center">
            Al solicitarlo, un asesor revisará tu caso y te confirmará. El descuento se aplica en tu estado de cuenta al aprobarse.
          </p>

          {/* Detalle: entran todas, no hay nada que marcar. */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <p className="px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
              Las {d.futuras.length} cuota(s) que estarías cancelando
            </p>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {d.futuras.map(c => (
                    <tr key={c.external_id}>
                      <td className="px-4 py-2 text-xs text-gray-500">{fdate(c.due_date)}</td>
                      <td className="px-4 py-2 text-xs text-gray-700">{c.concepto ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-sm">{money(c.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
