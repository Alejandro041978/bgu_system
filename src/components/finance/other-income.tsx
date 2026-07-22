'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, BookOpen, CalendarDays, Plane, Package, Undo2 } from 'lucide-react'

interface Row {
  id: string; flywire_ref: string | null; payer_name: string | null; payer_dni: string | null
  amount: number; method: string | null; income_date: string | null
  category: string; note: string | null; created_by: string | null
}
interface Data {
  rows: Row[]; years: string[]
  por_categoria: Record<string, { n: number; total: number }>
  total: number
}

const CATS: { key: string; label: string; icon: React.ElementType; cls: string }[] = [
  { key: 'eventos', label: 'Eventos', icon: CalendarDays, cls: 'bg-violet-50 border-violet-100 text-violet-700' },
  { key: 'libros', label: 'Libros', icon: BookOpen, cls: 'bg-blue-50 border-blue-100 text-blue-700' },
  { key: 'viajes', label: 'Viajes', icon: Plane, cls: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
  { key: 'otros', label: 'Otros', icon: Package, cls: 'bg-gray-50 border-gray-100 text-gray-600' },
]

const fmt = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')

export function OtherIncome() {
  const [data, setData] = useState<Data | null>(null)
  const [year, setYear] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(() => {
    fetch(`/api/finance/other-income${year ? `?year=${year}` : ''}`)
      .then(r => r.json()).then(d => { if (!d.error) setData(d); else setNotice({ kind: 'error', text: d.error }) })
  }, [year])
  useEffect(() => { load() }, [load])

  async function patch(id: string, body: object) {
    setBusy(id)
    const d = await fetch('/api/finance/other-income', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    }).then(r => r.json())
    setBusy(null)
    if (d.error) setNotice({ kind: 'error', text: d.error })
    load()
  }

  async function devolver(r: Row) {
    if (!confirm(`¿Devolver ${r.flywire_ref ?? 'este ingreso'} a la bandeja de conciliación? Se borra de Otros Ingresos.`)) return
    setBusy(r.id)
    const d = await fetch('/api/finance/other-income', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id }),
    }).then(res => res.json())
    setBusy(null)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: 'Devuelto a la bandeja de conciliación' })
    load()
  }

  if (!data) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-4">
      {notice && (
        <p className={`text-sm px-3 py-2 rounded-lg ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={e => setYear(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los años</option>
          {data.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {CATS.map(c => {
          const v = data.por_categoria[c.key]
          const Icon = c.icon
          return (
            <span key={c.key} className={`inline-flex items-center gap-2 border rounded-lg px-3 py-2 text-sm ${c.cls}`}>
              <Icon className="w-4 h-4" /> {c.label}: <b>${fmt(v?.total ?? 0)}</b> <span className="opacity-60">({v?.n ?? 0})</span>
            </span>
          )
        })}
        <span className="inline-flex items-center gap-2 bg-gray-900 text-white rounded-lg px-3 py-2 text-sm ml-auto">
          Total: <b>${fmt(data.total)}</b>
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-3 py-3">Pagador</th>
              <th className="text-left px-3 py-3">Referencia</th>
              <th className="text-left px-3 py-3">Categoría</th>
              <th className="text-left px-3 py-3">Nota</th>
              <th className="text-right px-3 py-3">Monto</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                Sin otros ingresos registrados{year ? ` en ${year}` : ''}. Se derivan desde Finanzas → Pagos por Conciliar.
              </td></tr>
            )}
            {data.rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-gray-600">{fdate(r.income_date)}</td>
                <td className="px-3 py-2.5">
                  <span className="text-gray-800">{r.payer_name ?? '—'}</span>
                  {r.payer_dni && <span className="text-xs text-gray-400 ml-1.5">{r.payer_dni}</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.flywire_ref ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <select value={r.category} disabled={busy === r.id}
                    onChange={e => patch(r.id, { category: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <input defaultValue={r.note ?? ''} placeholder="—"
                    onBlur={e => { if (e.target.value !== (r.note ?? '')) patch(r.id, { note: e.target.value }) }}
                    className="border border-transparent hover:border-gray-200 focus:border-gray-200 rounded-lg px-2 py-1 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-transparent" />
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900 tabular-nums">${fmt(Number(r.amount))}</td>
                <td className="px-3 py-2.5 text-right">
                  <button onClick={() => devolver(r)} disabled={busy === r.id}
                    title="Devolver a la bandeja de conciliación"
                    className="inline-flex items-center gap-1 border border-gray-200 hover:border-gray-300 text-gray-500 text-[11px] px-2 py-1 rounded-lg">
                    {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />} Devolver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        Ingresos de Flywire que no pertenecen a un estudiante ni a un programa (libros, eventos, viajes…). Se derivan desde la bandeja de Pagos por Conciliar; la categoría y la nota son editables aquí. &quot;Devolver&quot; deshace la derivación y la referencia reaparece en la bandeja.
      </p>
    </div>
  )
}
