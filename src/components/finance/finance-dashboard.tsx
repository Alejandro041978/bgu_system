'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react'

type CashflowPoint = { month: string; cash: number }
type IncomeExpensePoint = { month: string; income: number; expense: number }
type TopExpense = { name: string; amount: number }

type BooksData = {
  ok: boolean
  error?: string
  cashflow: CashflowPoint[]
  incomeExpense: IncomeExpensePoint[]
  totalIncome: number
  totalExpense: number
  topExpenses: TopExpense[]
}

const COLORS = ['#22c55e', '#f97316', '#3b82f6', '#eab308', '#a855f7', '#06b6d4']

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function shortMonth(s: string) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s.slice(0, 7)
  return d.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' })
}

// Simple SVG area chart for cash flow
function CashflowChart({ data }: { data: CashflowPoint[] }) {
  if (!data.length) return <div className="h-40 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
  const w = 600; const h = 180; const pad = { t: 20, r: 10, b: 40, l: 60 }
  const maxV = Math.max(...data.map(d => d.cash)) * 1.1 || 1
  const minV = Math.min(0, ...data.map(d => d.cash))
  const scaleX = (i: number) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r)
  const scaleY = (v: number) => pad.t + (1 - (v - minV) / (maxV - minV)) * (h - pad.t - pad.b)
  const points = data.map((d, i) => `${scaleX(i)},${scaleY(d.cash)}`).join(' ')
  const area = `M${scaleX(0)},${scaleY(data[0].cash)} ` +
    data.slice(1).map((d, i) => `L${scaleX(i + 1)},${scaleY(d.cash)}`).join(' ') +
    ` L${scaleX(data.length - 1)},${h - pad.b} L${scaleX(0)},${h - pad.b} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 180 }}>
      <defs>
        <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#cfGrad)" />
      <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={i} cx={scaleX(i)} cy={scaleY(d.cash)} r="3" fill="#3b82f6" />
      ))}
      {data.map((d, i) => (
        <text key={i} x={scaleX(i)} y={h - 8} textAnchor="middle" fontSize="9" fill="#9ca3af">
          {shortMonth(d.month)}
        </text>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const v = minV + t * (maxV - minV)
        const y = scaleY(v)
        return (
          <g key={t}>
            <line x1={pad.l - 4} x2={w - pad.r} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="0.5" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
              {v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// Bar chart for income/expense
function IncomeExpenseChart({ data }: { data: IncomeExpensePoint[] }) {
  if (!data.length) return <div className="h-32 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
  const w = 500; const h = 140; const pad = { t: 10, r: 10, b: 30, l: 50 }
  const maxV = Math.max(...data.map(d => Math.max(d.income, d.expense))) * 1.1 || 1
  const barW = Math.max(4, ((w - pad.l - pad.r) / data.length) * 0.35)
  const scaleX = (i: number) => pad.l + (i + 0.5) * ((w - pad.l - pad.r) / data.length)
  const scaleY = (v: number) => pad.t + (1 - v / maxV) * (h - pad.t - pad.b)
  const barH = (v: number) => (v / maxV) * (h - pad.t - pad.b)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 140 }}>
      {data.map((d, i) => (
        <g key={i}>
          <rect x={scaleX(i) - barW - 1} y={scaleY(d.income)} width={barW} height={barH(d.income)} fill="#22c55e" rx="1" />
          <rect x={scaleX(i) + 1} y={scaleY(d.expense)} width={barW} height={barH(d.expense)} fill="#ef4444" rx="1" />
          <text x={scaleX(i)} y={h - 6} textAnchor="middle" fontSize="8" fill="#9ca3af">
            {shortMonth(d.month)}
          </text>
        </g>
      ))}
      {[0, 0.5, 1].map(t => {
        const v = t * maxV
        const y = scaleY(v)
        return (
          <g key={t}>
            <line x1={pad.l - 4} x2={w - pad.r} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="0.5" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="8" fill="#9ca3af">
              {v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// Donut chart for top expenses
function DonutChart({ data }: { data: TopExpense[] }) {
  if (!data.length) return <div className="w-32 h-32 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
  const total = data.reduce((s, d) => s + d.amount, 0)
  const cx = 60; const cy = 60; const r = 48; const ri = 30
  let angle = -Math.PI / 2
  const slices = data.map((d, i) => {
    const a = (d.amount / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    const x2 = cx + ri * Math.cos(angle)
    const y2 = cy + ri * Math.sin(angle)
    angle += a
    const x3 = cx + r * Math.cos(angle)
    const y3 = cy + r * Math.sin(angle)
    const x4 = cx + ri * Math.cos(angle)
    const y4 = cy + ri * Math.sin(angle)
    const large = a > Math.PI ? 1 : 0
    return {
      d: `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x3},${y3} L${x4},${y4} A${ri},${ri} 0 ${large} 0 ${x2},${y2} Z`,
      color: COLORS[i % COLORS.length],
    }
  })

  return (
    <svg viewBox="0 0 120 120" style={{ width: 120, height: 120 }}>
      {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="7" fill="#6b7280">All Expenses</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fill="#111827" fontWeight="600">
        {total >= 1000000 ? `$${(total / 1000000).toFixed(1)}M` : total >= 1000 ? `$${(total / 1000).toFixed(0)}K` : `$${total.toFixed(0)}`}
      </text>
    </svg>
  )
}

// Fallback table when API has no detailed data
function MonthlySalesTable({ data }: { data: IncomeExpensePoint[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left py-2 px-3">Mes</th>
            <th className="text-right py-2 px-3">Ingresos</th>
            <th className="text-right py-2 px-3">Gastos</th>
            <th className="text-right py-2 px-3">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => {
            const diff = d.income - d.expense
            return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 text-gray-700">{shortMonth(d.month)}</td>
                <td className="py-2 px-3 text-right text-green-700 font-medium">{fmt(d.income)}</td>
                <td className="py-2 px-3 text-right text-red-600">{fmt(d.expense)}</td>
                <td className={`py-2 px-3 text-right font-semibold ${diff >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{fmt(diff)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function FinanceDashboard() {
  const [data, setData] = useState<BooksData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true)
    else setLoading(true)
    const res = await fetch('/api/finance/books')
    const json = await res.json() as BooksData
    setData(json)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  const hasChartData = data?.ok && (data.cashflow.length > 0 || data.incomeExpense.length > 0)
  const hasTableData = data?.ok && data.incomeExpense.length > 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
          <p className="text-sm text-gray-500 mt-0.5">Dashboard financiero · Zoho Books</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors text-gray-700"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <a
            href="https://books.zoho.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Abrir Zoho Books
          </a>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-48" />
          ))}
        </div>
      )}

      {/* API error — but still show Zoho Books link */}
      {!loading && data && !data.ok && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">No se pudo conectar con Zoho Books</p>
              <p className="text-xs text-amber-700 mt-1">{data.error}</p>
              <p className="text-xs text-amber-600 mt-2">
                Verifica que el token de Zoho incluya el scope <code className="bg-amber-100 px-1 rounded">ZohoBooks.reports.READ</code> y que esté configurado en Vercel.
              </p>
              <a
                href="https://books.zoho.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-amber-800 underline hover:text-amber-900"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Ver dashboard en Zoho Books directamente
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Data loaded */}
      {!loading && data?.ok && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Ingresos totales</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(data.totalIncome)}</p>
              <div className="flex items-center gap-1 mt-1 text-green-600 text-xs">
                <TrendingUp className="w-3.5 h-3.5" /> Este año fiscal
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Gastos totales</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(data.totalExpense)}</p>
              <div className="flex items-center gap-1 mt-1 text-red-500 text-xs">
                <TrendingDown className="w-3.5 h-3.5" /> Este año fiscal
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Resultado neto</p>
              {(() => {
                const net = data.totalIncome - data.totalExpense
                return (
                  <>
                    <p className={`text-2xl font-bold ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(net)}</p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                      <DollarSign className="w-3.5 h-3.5" /> {net >= 0 ? 'Superávit' : 'Déficit'}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          {/* Charts row */}
          {hasChartData ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Cash Flow */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-semibold text-gray-900 mb-4">Flujo de Caja · Últimos 12 meses</p>
                <CashflowChart data={data.cashflow} />
              </div>

              {/* Top Expenses donut */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-semibold text-gray-900 mb-4">Top Gastos</p>
                <div className="flex items-center gap-4">
                  <DonutChart data={data.topExpenses} />
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {data.topExpenses.map((e, i) => (
                      <div key={i} className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-gray-600 truncate flex-1" title={e.name}>{e.name}</span>
                        <span className="text-xs font-medium text-gray-900 flex-shrink-0">
                          {e.amount >= 1000 ? `$${(e.amount / 1000).toFixed(0)}K` : `$${e.amount.toFixed(0)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Income/Expense bar chart */}
          {data.incomeExpense.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-900">Ingresos y Gastos Mensuales</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Ingresos</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Gastos</span>
                </div>
              </div>
              <IncomeExpenseChart data={data.incomeExpense} />
            </div>
          )}

          {/* Monthly sales table (always visible if data exists) */}
          {hasTableData && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-900 mb-4">Ventas Mensuales</p>
              <MonthlySalesTable data={data.incomeExpense} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
