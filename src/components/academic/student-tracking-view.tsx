'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, Phone, Mail } from 'lucide-react'

interface Row {
  student_id: string; balance: number | null; last_erp_login: string | null; last_moodle_access: string | null
  inactivity_days: number | null; risk_level: string; name: string; phone: string | null; email: string | null; document_number: string | null
  situation: string; situation_source: string
}
interface Data { rows: Row[]; counts: Record<string, number>; situations?: Record<string, number>; last_updated: string | null }

const RISK: Record<string, { label: string; cls: string }> = {
  active:  { label: 'Activo',            cls: 'bg-green-50 text-green-700' },
  nudge7:  { label: 'Inactivo ≥7 días',  cls: 'bg-amber-50 text-amber-700' },
  warn14:  { label: 'Inactivo ≥14 días', cls: 'bg-red-50 text-red-700' },
  never:   { label: 'Nunca conectó',     cls: 'bg-gray-100 text-gray-500' },
}
const SITUATION: Record<string, { label: string; cls: string }> = {
  activo:            { label: 'Activo',          cls: 'bg-green-50 text-green-700' },
  egresado:          { label: 'Egresado',        cls: 'bg-blue-50 text-blue-700' },
  retiro_permanente: { label: 'Retiro perm. (IW)', cls: 'bg-rose-50 text-rose-700' },
  retiro_temporal:   { label: 'Retiro temp. (LOA)', cls: 'bg-orange-50 text-orange-700' },
  campus_socio:      { label: 'Campus socio',    cls: 'bg-violet-50 text-violet-700' },
}
const SITUATION_KEYS = ['activo', 'egresado', 'retiro_permanente', 'retiro_temporal', 'campus_socio'] as const
const money = (n: number | null) => n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export function StudentTrackingView() {
  const [data, setData] = useState<Data | null>(null)
  const [risk, setRisk] = useState('')
  const [situation, setSituation] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (risk) qs.set('risk', risk)
    if (situation) qs.set('situation', situation)
    const d = await fetch(`/api/academic/tracking${qs.toString() ? `?${qs}` : ''}`).then(r => r.json())
    setData(d); setLoading(false)
  }, [risk, situation])
  useEffect(() => { load() }, [load])

  async function setStudentSituation(student_id: string, value: string) {
    setData(prev => prev ? { ...prev, rows: prev.rows.map(r => r.student_id === student_id ? { ...r, situation: value, situation_source: value === 'activo' ? 'auto' : 'manual' } : r) } : prev)
    await fetch('/api/academic/tracking', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, situation: value }),
    })
  }

  async function recalc() {
    setRunning(true)
    const d = await fetch('/api/academic/tracking', { method: 'POST' }).then(r => r.json())
    setRunning(false)
    if (d.error) { alert(d.error); return }
    alert(`Recalculado: ${d.processed} estudiantes.\nMoodle: ${d.moodle}`)
    load()
  }

  const counts = data?.counts ?? {}
  const sitCounts = data?.situations ?? {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-400">
          {data?.last_updated ? `Última actualización: ${new Date(data.last_updated).toLocaleString('es-PE')}` : 'Sin datos aún'}
        </p>
        <button onClick={recalc} disabled={running} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}{running ? 'Recalculando…' : 'Recalcular ahora'}
        </button>
      </div>

      {/* Filtros por nivel de inactividad */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setRisk('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${risk === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          Todos <span className="opacity-70">({total})</span>
        </button>
        {(['active', 'nudge7', 'warn14', 'never'] as const).map(k => (
          <button key={k} onClick={() => setRisk(k)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${risk === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {RISK[k].label} <span className="opacity-70">({counts[k] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Filtros por situación (la campaña de retención sólo aplica a "Activo") */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide mr-1">Situación:</span>
        <button onClick={() => setSituation('')} className={`px-3 py-1 rounded-lg text-xs font-medium border ${situation === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Todas</button>
        <button onClick={() => setSituation('excluidos')} className={`px-3 py-1 rounded-lg text-xs font-medium border ${situation === 'excluidos' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          Excluidos de campaña <span className="opacity-70">({total - (sitCounts.activo ?? 0)})</span>
        </button>
        {SITUATION_KEYS.map(k => (
          <button key={k} onClick={() => setSituation(k)} className={`px-3 py-1 rounded-lg text-xs font-medium border ${situation === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {SITUATION[k].label} <span className="opacity-70">({sitCounts[k] ?? 0})</span>
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : data.rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">Sin registros. Pulsa «Recalcular ahora» para generar el seguimiento.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-2.5">Estudiante</th>
                <th className="text-right px-4 py-2.5">Deuda</th>
                <th className="text-left px-4 py-2.5">Últ. ERP</th>
                <th className="text-left px-4 py-2.5">Últ. Moodle (aula)</th>
                <th className="text-right px-4 py-2.5">Días inact.</th>
                <th className="text-center px-4 py-2.5">Riesgo</th>
                <th className="text-left px-4 py-2.5">Situación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.map(r => (
                <tr key={r.student_id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <p className="text-gray-800">{r.name || r.document_number || 'Estudiante'}</p>
                    <div className="text-[11px] text-gray-400 flex gap-2">
                      {r.phone && <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" />{r.phone}</span>}
                      {r.email && <span className="flex items-center gap-0.5"><Mail className="w-3 h-3" />{r.email}</span>}
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 text-right ${(r.balance ?? 0) > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{money(r.balance)}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{fdate(r.last_erp_login)}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{fdate(r.last_moodle_access)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{r.inactivity_days ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${RISK[r.risk_level]?.cls ?? 'bg-gray-100 text-gray-500'}`}>{RISK[r.risk_level]?.label ?? r.risk_level}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={r.situation}
                      onChange={e => setStudentSituation(r.student_id, e.target.value)}
                      title={r.situation_source === 'manual' ? 'Etiqueta manual' : 'Automático (sync de retiros)'}
                      className={`text-[11px] font-medium rounded-full px-2 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${SITUATION[r.situation]?.cls ?? 'bg-gray-100 text-gray-500'}`}
                    >
                      {SITUATION_KEYS.map(k => <option key={k} value={k}>{SITUATION[k].label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
