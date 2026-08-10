'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Fila {
  payment_id: string; fecha: string; importe: number | null; moneda: string | null
  pagador: string; documento: string | null; email: string | null
  id_cuota: string | null; firma: boolean; motivo: string; accion: string
}
interface Data { total: number; importe: number; por_accion: Record<string, number>; filas: Fila[] }

const money = (n: number | null) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const COLOR: Record<string, string> = {
  'Admisión': 'bg-blue-50 text-blue-700',
  'Cobranzas': 'bg-amber-50 text-amber-800',
  'Sistemas': 'bg-red-50 text-red-700',
  'se puede conciliar': 'bg-green-50 text-green-700',
}

export function FlywireUnmatched() {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/finance/flywire-unmatched').then(r => r.json())
      .then(j => j.error ? setError(j.error) : setD(j))
      .catch(() => setError('No se pudo cargar'))
  }, [])

  if (error) return <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</p>
  if (!d) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  if (!d.total) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
        <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
        <p className="text-sm text-gray-600">Todos los pagos notificados por Flywire están reflejados en un estado de cuenta.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-[11px] text-gray-500">Sin conciliar</p>
          <p className="text-lg font-bold text-gray-900">{d.total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-[11px] text-gray-500">Importe</p>
          <p className="text-lg font-bold text-blue-700">{money(d.importe)}</p>
        </div>
        {Object.entries(d.por_accion).map(([k, v]) => (
          <div key={k} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-[11px] text-gray-500">{k}</p>
            <p className="text-lg font-bold text-gray-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 w-28">Fecha</th>
                <th className="text-left px-3 py-2.5">Pago</th>
                <th className="text-left px-3 py-2.5">Pagador</th>
                <th className="text-right px-3 py-2.5 w-24">Importe</th>
                <th className="text-left px-3 py-2.5">Por qué no se colocó</th>
                <th className="text-left px-3 py-2.5 w-36">Quién resuelve</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.filas.map(f => (
                <tr key={f.payment_id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-xs text-gray-500">{f.fecha}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{f.payment_id}</td>
                  <td className="px-3 py-2.5">
                    <p className="text-gray-800">{f.pagador}</p>
                    <p className="text-[11px] text-gray-400">{f.documento ?? f.email ?? '—'}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-800">{money(f.importe)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">{f.motivo}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${COLOR[f.accion] ?? 'bg-gray-100 text-gray-600'}`}>{f.accion}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-gray-400">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
        La mayoría son postulantes que pagaron su admisión desde el portal de Flywire y todavía no existen en el ERP:
        al crearlos y emitirles su cuota, el pago se coloca solo. Los marcados como Sistemas son fallos de firma y no
        deben tocarse hasta revisarlos.
      </p>
    </div>
  )
}
