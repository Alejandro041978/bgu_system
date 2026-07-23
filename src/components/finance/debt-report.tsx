'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertTriangle, TrendingDown, Wallet, CalendarClock, Users } from 'lucide-react'

type Row = {
  categoria_id: string; sigla: string; nombre: string
  cuotas_pasado: number; cuotas_actual: number; cuotas_futuro: number
  pagos_pasado: number; pagos_actual: number; pagos_futuro: number
  deuda_vencida: number; deuda_por_vencer: number; deudores: number
}
type Data = {
  month: string
  kpis: { indice_morosidad: number | null; tasa_recaudacion: number | null; deuda_vencida: number; deuda_por_vencer: number; deudores: number }
  table: Row[]
  totales: Omit<Row, 'categoria_id' | 'sigla' | 'nombre'>
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function DebtReport() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (m: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/finance/debt-report?month=${m}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Error')
      setData(d)
    } catch (e) { setError(String((e as Error).message)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(month) }, [month, load])

  const k = data?.kpis
  const kpiCards = [
    { label: 'Índice de morosidad', value: k?.indice_morosidad != null ? `${k.indice_morosidad}%` : '—', hint: 'deuda vencida / deuda total', icon: AlertTriangle, tone: 'text-red-600 bg-red-50' },
    { label: 'Tasa de recaudación', value: k?.tasa_recaudacion != null ? `${k.tasa_recaudacion}%` : '—', hint: 'pagos del mes / (deuda arrastrada + cuotas del mes)', icon: TrendingDown, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Deuda vencida', value: k ? money(k.deuda_vencida) : '—', hint: 'exigible no pagado', icon: Wallet, tone: 'text-orange-600 bg-orange-50' },
    { label: 'Deuda por vencer', value: k ? money(k.deuda_por_vencer) : '—', hint: 'cuotas futuras netas', icon: CalendarClock, tone: 'text-blue-600 bg-blue-50' },
    { label: 'Estudiantes deudores', value: k ? String(k.deudores) : '—', hint: 'con deuda vencida o por vencer', icon: Users, tone: 'text-purple-600 bg-purple-50' },
  ]

  const num = (n: number, strong = false) => (
    <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${strong ? 'font-semibold' : ''}`}>{money(n)}</td>
  )

  return (
    <div className="space-y-6">
      {/* Filtro por mes */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">Mes de consulta</label>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiCards.map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${c.tone}`}><c.icon className="w-4 h-4" /></div>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{c.value}</p>
            <p className="text-sm font-medium text-gray-700">{c.label}</p>
            <p className="text-[11px] text-gray-400">{c.hint}</p>
          </div>
        ))}
      </div>

      {/* Tabla por categoría */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Categoría</th>
                <th colSpan={3} className="px-3 py-1.5 text-center border-l border-gray-200">Cuotas</th>
                <th colSpan={3} className="px-3 py-1.5 text-center border-l border-gray-200">Pagos</th>
                <th colSpan={2} className="px-3 py-1.5 text-center border-l border-gray-200">Deuda</th>
                <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l border-gray-200">Deudores</th>
              </tr>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-3 py-1.5 text-right border-l border-gray-200">Pasado</th>
                <th className="px-3 py-1.5 text-right">Actual</th>
                <th className="px-3 py-1.5 text-right">Futuro</th>
                <th className="px-3 py-1.5 text-right border-l border-gray-200">Pasado</th>
                <th className="px-3 py-1.5 text-right">Actual</th>
                <th className="px-3 py-1.5 text-right">Futuro</th>
                <th className="px-3 py-1.5 text-right border-l border-gray-200">Vencida</th>
                <th className="px-3 py-1.5 text-right">Por vencer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.table ?? []).map(r => (
                <tr key={r.categoria_id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2">
                    <span className="font-semibold text-gray-900">{r.sigla}</span>
                    <span className="block text-[11px] text-gray-400">{r.nombre}</span>
                  </td>
                  {num(r.cuotas_pasado)}{num(r.cuotas_actual)}{num(r.cuotas_futuro)}
                  {num(r.pagos_pasado)}{num(r.pagos_actual)}{num(r.pagos_futuro)}
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap ${r.deuda_vencida > 0.005 ? 'text-red-600' : 'text-gray-500'}`}>{money(r.deuda_vencida)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700 whitespace-nowrap">{money(r.deuda_por_vencer)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.deudores}</td>
                </tr>
              ))}
              {data && (
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-3 py-2 text-gray-900">Total</td>
                  {num(data.totales.cuotas_pasado, true)}{num(data.totales.cuotas_actual, true)}{num(data.totales.cuotas_futuro, true)}
                  {num(data.totales.pagos_pasado, true)}{num(data.totales.pagos_actual, true)}{num(data.totales.pagos_futuro, true)}
                  <td className="px-3 py-2 text-right tabular-nums text-red-600 whitespace-nowrap">{money(data.totales.deuda_vencida)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-blue-700 whitespace-nowrap">{money(data.totales.deuda_por_vencer)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{data.totales.deudores}</td>
                </tr>
              )}
              {!loading && !data?.table?.length && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400 text-sm">Sin datos para este mes.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
          Cuotas clasificadas por su fecha de vencimiento y pagos por su fecha de pago, respecto del mes de consulta.
          Deuda vencida = cuotas pasado + actual − pagos pasado − actual · Deuda por vencer = cuotas futuro − pagos futuro.
          Las cuotas sin vencimiento se consideran ya exigibles.
        </p>
      </div>
    </div>
  )
}
