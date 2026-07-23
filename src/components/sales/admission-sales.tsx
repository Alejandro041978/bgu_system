'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Trash2, Settings2 } from 'lucide-react'

interface Sale {
  enrollment_id: string; enrollment_date: string | null; status: string | null
  student_name: string; document_number: string | null
  program_name: string | null; category_id: string | null
  advisor_id: string | null; admission_type_id: string | null; commission_amount: number | null
}
interface Advisor { id: string; full_name: string }
interface AdmType { id: string; category_id: string; name: string; commission: number; active: boolean }
interface Cat { id: string; name: string; sigla: string | null }

const money = (n: number) => `$${Number(n).toFixed(2)}`

export function AdmissionSales() {
  const [convocatorias, setConvocatorias] = useState<{ id: string; name: string }[]>([])
  const [advisors, setAdvisors] = useState<Advisor[]>([])
  const [types, setTypes] = useState<AdmType[]>([])
  const [categories, setCategories] = useState<Cat[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [convId, setConvId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  // Config de tipos
  const [tCat, setTCat] = useState('')
  const [tName, setTName] = useState('')
  const [tComm, setTComm] = useState('')

  const load = useCallback(async (c: string) => {
    setLoading(true)
    const d = await fetch(`/api/sales/admissions${c ? `?convocatoria=${c}` : ''}`).then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setConvocatorias(d.convocatorias ?? []); setAdvisors(d.advisors ?? [])
    setTypes(d.types ?? []); setCategories(d.categories ?? []); setSales(d.sales ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load(convId) }, [convId, load])

  async function assign(enrollmentId: string, patch: { advisor_id?: string | null; admission_type_id?: string | null }) {
    const s = sales.find(x => x.enrollment_id === enrollmentId)
    if (!s) return
    const body = {
      enrollment_id: enrollmentId,
      advisor_id: patch.advisor_id !== undefined ? patch.advisor_id : s.advisor_id,
      admission_type_id: patch.admission_type_id !== undefined ? patch.admission_type_id : s.admission_type_id,
    }
    const d = await fetch('/api/sales/admissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load(convId)
  }

  async function createType() {
    if (!tCat || !tName.trim()) return
    const d = await fetch('/api/sales/admission-types', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: tCat, name: tName, commission: Number(tComm) || 0 }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    setTName(''); setTComm('')
    load(convId)
  }

  async function patchType(id: string, patch: Record<string, unknown>) {
    const d = await fetch('/api/sales/admission-types', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load(convId)
  }

  async function removeType(id: string) {
    if (!confirm('¿Borrar este tipo de admisión?')) return
    const d = await fetch(`/api/sales/admission-types?id=${id}`, { method: 'DELETE' }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load(convId)
  }

  const typeById = useMemo(() => new Map(types.map(t => [t.id, t])), [types])
  const advisorName = (id: string | null) => advisors.find(a => a.id === id)?.full_name ?? 'Sin asesora'

  // ── Cuadro resumen: por asesora, cantidad × comisión de cada tipo = total ──
  const resumen = useMemo(() => {
    const por = new Map<string, { name: string; byType: Map<string, { name: string; count: number; commission: number }>; total: number; ventas: number }>()
    for (const s of sales) {
      const key = s.advisor_id ?? 'sin'
      if (!por.has(key)) por.set(key, { name: s.advisor_id ? advisorName(s.advisor_id) : 'Sin asesora asignada', byType: new Map(), total: 0, ventas: 0 })
      const r = por.get(key)!
      r.ventas++
      if (s.admission_type_id) {
        const t = typeById.get(s.admission_type_id)
        const comm = Number(s.commission_amount ?? t?.commission ?? 0)
        const tk = s.admission_type_id
        if (!r.byType.has(tk)) r.byType.set(tk, { name: t?.name ?? '?', count: 0, commission: comm })
        const bt = r.byType.get(tk)!
        bt.count++
        r.total += comm
      }
    }
    return [...por.entries()].sort((a, b) => b[1].total - a[1].total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, types, advisors])

  const totalVentas = sales.length
  const totalComisiones = resumen.reduce((s, [, r]) => s + r.total, 0)

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span>{error}</span><button onClick={() => setError(null)}>✕</button></div>}

      {/* Filtro + config */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-600">Convocatoria</label>
        <select value={convId} onChange={e => setConvId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white max-w-xl focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Seleccionar convocatoria…</option>
          {convocatorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        <button onClick={() => setShowConfig(v => !v)} className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2">
          <Settings2 className="w-3.5 h-3.5" />Tipos de admisión y comisiones
        </button>
      </div>

      {/* Config de tipos por categoría */}
      {showConfig && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Tipos de admisión por categoría</p>
          <p className="text-[11px] text-gray-400">Cambiar una comisión rige para asignaciones NUEVAS: las ventas ya asignadas conservan la comisión con que se registraron.</p>
          <div className="flex gap-2 flex-wrap items-end">
            <select value={tCat} onChange={e => setTCat(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white w-72">
              <option value="">Categoría…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={tName} onChange={e => setTName(e.target.value)} placeholder="Nombre (Interna, Externa, Convenio…)" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-64" />
            <input value={tComm} onChange={e => setTComm(e.target.value)} placeholder="Comisión USD" inputMode="decimal" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-28" />
            <button onClick={createType} disabled={!tCat || !tName.trim()} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"><Plus className="w-3.5 h-3.5" />Crear</button>
          </div>
          <div className="divide-y divide-gray-50">
            {categories.map(c => {
              const ts = types.filter(t => t.category_id === c.id)
              if (!ts.length) return null
              return (
                <div key={c.id} className="py-2">
                  <p className="text-xs font-medium text-gray-500 mb-1">{c.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {ts.map(t => (
                      <span key={t.id} className={`inline-flex items-center gap-2 text-xs rounded-lg border px-2 py-1 ${t.active ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-gray-100 bg-gray-50/50 text-gray-400 line-through'}`}>
                        {t.name} · {money(t.commission)}
                        <button onClick={() => { const v = prompt(`Nueva comisión para "${t.name}" (USD):`, String(t.commission)); if (v != null && v.trim() !== '') patchType(t.id, { commission: Number(v) }) }} className="text-blue-500 hover:text-blue-700">editar</button>
                        <button onClick={() => patchType(t.id, { active: !t.active })} className="text-amber-500 hover:text-amber-700">{t.active ? 'desactivar' : 'activar'}</button>
                        <button onClick={() => removeType(t.id)} className="text-gray-300 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cuadro resumen de comisiones */}
      {convId && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Resumen de comisiones</h3>
            <p className="text-xs text-gray-500">{totalVentas} venta(s) · comisiones {money(totalComisiones)}</p>
          </div>
          {resumen.length === 0 ? <p className="px-4 py-6 text-center text-xs text-gray-400">Sin ventas en esta convocatoria.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="px-4 py-2 text-left">Asesora</th>
                  <th className="px-4 py-2 text-right">Ventas</th>
                  <th className="px-4 py-2 text-left">Detalle por tipo</th>
                  <th className="px-4 py-2 text-right">Total comisiones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resumen.map(([key, r]) => (
                  <tr key={key} className={key === 'sin' ? 'bg-amber-50/40' : ''}>
                    <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.ventas}</td>
                    <td className="px-4 py-2 text-xs text-gray-600">
                      {[...r.byType.values()].map((bt, i) => (
                        <span key={i} className="inline-block bg-gray-100 rounded-full px-2 py-0.5 mr-1.5 mb-0.5 tabular-nums">
                          {bt.count} × {money(bt.commission)} {bt.name}
                        </span>
                      ))}
                      {r.byType.size === 0 && <span className="text-gray-400">sin tipo asignado</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tabla de ventas */}
      {convId && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="px-4 py-2 text-left">Estudiante</th>
                  <th className="px-4 py-2 text-left">Programa</th>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-left">Asesora</th>
                  <th className="px-4 py-2 text-left">Tipo de admisión</th>
                  <th className="px-4 py-2 text-right">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sales.map(s => {
                  const opciones = types.filter(t => t.category_id === s.category_id && (t.active || t.id === s.admission_type_id))
                  return (
                    <tr key={s.enrollment_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2">
                        <span className="text-gray-800">{s.student_name}</span>
                        <span className="block text-[11px] text-gray-400">{s.document_number}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{s.program_name}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{s.enrollment_date ? String(s.enrollment_date).slice(0, 10) : '—'}</td>
                      <td className="px-4 py-2">
                        <select value={s.advisor_id ?? ''} onChange={e => assign(s.enrollment_id, { advisor_id: e.target.value || null })}
                          className={`border rounded-lg px-2 py-1 text-xs bg-white w-44 ${s.advisor_id ? 'border-gray-200 text-gray-700' : 'border-amber-300 text-amber-700'}`}>
                          <option value="">Sin asesora…</option>
                          {advisors.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select value={s.admission_type_id ?? ''} onChange={e => assign(s.enrollment_id, { admission_type_id: e.target.value || null })}
                          className={`border rounded-lg px-2 py-1 text-xs bg-white w-40 ${s.admission_type_id ? 'border-gray-200 text-gray-700' : 'border-amber-300 text-amber-700'}`}>
                          <option value="">Sin tipo…</option>
                          {opciones.map(t => <option key={t.id} value={t.id}>{t.name} · {money(t.commission)}</option>)}
                        </select>
                        {s.category_id && opciones.length === 0 && <span className="block text-[10px] text-amber-600 mt-0.5">Sin tipos para esta categoría (créalos en la configuración)</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.commission_amount != null ? money(s.commission_amount) : '—'}</td>
                    </tr>
                  )
                })}
                {!loading && sales.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-gray-400">Sin matrículas en esta convocatoria.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!convId && !loading && <p className="text-center text-xs text-gray-400 py-10">Elige una convocatoria para ver sus ventas.</p>}
    </div>
  )
}
