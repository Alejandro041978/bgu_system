'use client'

import { Fragment, useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Zap } from 'lucide-react'

// Pertenencia de un KPI a los tres planes (17/09/2026): el catálogo es único y
// cada plan lo enlaza. Estratégico/Efectividad = casilla (el objetivo se deriva
// de la dimensión del código); Evaluación = las MEDIDAS que lo triangulan.
interface Pertenencia {
  estrategico: { alias: string | null } | null
  efectividad: { meta: number | null } | null
  medidas: string[]
  ancla: string | null
  tiene_resultado?: boolean
}
interface MedidaRef { id: string; code: string; name: string }

interface KPI {
  id: string
  code: string
  level: string
  name: string
  formula?: string
  scope?: string
  frequency: string
  value_type: string
  formula_type: string | null
  created_at: string
}

const LEVELS = [
  { value: 'institucional', label: 'Institucional' },
  { value: 'estrategico', label: 'Estratégico' },
  { value: 'operativo', label: 'Operativo' },
]
const FREQUENCIES = [
  { value: 'anual', label: 'Anual' },
  { value: 'semestral', label: 'Semestral' },
]
const VALUE_TYPES = [
  { value: 'porcentaje', label: 'Porcentaje (%)' },
  { value: 'entero', label: 'Entero' },
  { value: 'decimal', label: 'Decimal' },
]
const FORMULA_TYPES = [
  { value: '', label: 'Sin cálculo automático' },
  { value: 'faculty_nationality_diversity', label: 'Diversidad internacional del claustro' },
  { value: 'capacitacion_beneficiados_administrativa', label: 'Beneficiados cap. administrativa' },
  { value: 'capacitacion_beneficiados_tecnologica', label: 'Beneficiados cap. tecnológica' },
  { value: 'capacitacion_beneficiados_academica', label: 'Beneficiados cap. académica' },
  { value: 'capacitacion_beneficiados_etica', label: 'Beneficiados cap. ética e inclusión' },
  { value: 'desk_csat_promedio', label: 'CSAT servicios administrativos (%)' },
  { value: 'convenios_alianzas_activas', label: 'Alianzas activas con matrículas (%)' },
  { value: 'student_geographic_diversity', label: 'Diversidad geográfica del alumnado (países únicos)' },
]

// El prefijo del código del KPI (E1-I01 → E1) ES la dimensión del plan
// estratégico. Los nombres reflejan strategic_dimensions; un prefijo nuevo que
// no esté aquí se muestra igual, solo sin nombre.
const DIMENSION_NAMES: Record<string, string> = {
  E1: 'Academic Portfolio',
  E2: 'Academic Staff',
  E3: 'Human Capital',
  E4: 'Technological Platforms',
  E5: 'Global Positioning',
  E6: 'University Culture',
  E7: 'Financial Support',
}
const dimensionDe = (code: string): string => String(code).split('-')[0]?.trim().toUpperCase() ?? ''

const LEVEL_COLORS: Record<string, string> = {
  institucional: 'bg-purple-100 text-purple-700',
  estrategico: 'bg-blue-100 text-blue-700',
  operativo: 'bg-green-100 text-green-700',
}

const emptyForm = {
  code: '', level: 'institucional', name: '', formula: '', scope: '',
  frequency: 'anual', value_type: 'porcentaje', formula_type: '',
}

export function EffectivenessKPICatalog() {
  const [kpis, setKpis] = useState<KPI[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<typeof emptyForm>({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null)
  const [editingFormulaValue, setEditingFormulaValue] = useState<string>('')
  const [filtroDim, setFiltroDim] = useState('')
  const [pert, setPert] = useState<Record<string, Pertenencia>>({})
  const [medidas, setMedidas] = useState<MedidaRef[]>([])
  const [ctx, setCtx] = useState<{ ciclo: string | null; plan_efectividad: string | null; plan_evaluacion: string | null } | null>(null)
  const [busyKpi, setBusyKpi] = useState<string | null>(null)
  const [evalAbierto, setEvalAbierto] = useState<string | null>(null)
  const [evalSel, setEvalSel] = useState<Set<string>>(new Set())
  const [filtroPlan, setFiltroPlan] = useState('')

  const cargarPert = () => fetch('/api/planning/effectiveness/kpi-plans').then(r => r.json()).then(d => {
    if (d.error) return
    setPert(d.pertenencias ?? {}); setMedidas(d.medidas ?? []); setCtx(d.contexto ?? null)
  }).catch(() => {})

  useEffect(() => {
    fetch('/api/planning/effectiveness/kpis')
      .then(r => r.json())
      .then((d: KPI[]) => { setKpis(d); setLoading(false) })
      .catch(() => setLoading(false))
    cargarPert()
  }, [])

  async function postPlan(body: object, kpiId: string): Promise<boolean> {
    setBusyKpi(kpiId)
    const r = await fetch('/api/planning/effectiveness/kpi-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    setBusyKpi(null)
    if (!r.ok) { alert(d.error ?? 'No se pudo guardar'); return false }
    await cargarPert()
    return true
  }

  async function togglePlan(kpi: KPI, plan: 'estrategico' | 'efectividad', on: boolean) {
    const p = pert[kpi.id]
    if (!on) {
      const pierde = plan === 'estrategico'
        ? 'su vigencia por años, su alias y su responsable en el plan estratégico'
        : 'su meta, responsable, estado y decisión en el plan de efectividad'
      const aviso = `¿Quitar "${kpi.code} · ${kpi.name}" del plan ${plan === 'estrategico' ? 'estratégico' : 'de efectividad'}?\n\nSe pierde ${pierde}.${p?.tiene_resultado ? '\n\n⚠ Este KPI tiene RESULTADOS medidos: no se borran (viven por año), pero dejarán de verse en los tableros de este plan.' : ''}`
      if (!confirm(aviso)) return
      await postPlan({ kpi_id: kpi.id, plan, on: false }, kpi.id)
      return
    }
    let alias: string | null | undefined = undefined
    if (plan === 'estrategico') {
      const v = window.prompt(`Código de "${kpi.code}" en el plan estratégico (alias, ej. ${dimensionDe(kpi.code)}-K1). Déjalo vacío si usa el mismo código.`, '')
      if (v === null) return
      alias = v.trim() || null
    }
    await postPlan({ kpi_id: kpi.id, plan, on: true, alias }, kpi.id)
  }

  async function editarAlias(kpi: KPI) {
    const actual = pert[kpi.id]?.estrategico?.alias ?? ''
    const v = window.prompt(`Código de "${kpi.code}" en el plan estratégico:`, actual)
    if (v === null) return
    await postPlan({ kpi_id: kpi.id, plan: 'estrategico', on: true, alias: v.trim() || null }, kpi.id)
  }

  function abrirEval(kpi: KPI) {
    setEvalAbierto(evalAbierto === kpi.id ? null : kpi.id)
    setEvalSel(new Set(pert[kpi.id]?.medidas ?? []))
  }
  async function guardarEval(kpi: KPI) {
    const ok = await postPlan({ kpi_id: kpi.id, plan: 'evaluacion', measure_ids: [...evalSel] }, kpi.id)
    if (ok) setEvalAbierto(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/planning/effectiveness/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, formula_type: form.formula_type || null }),
      })
      const data = await res.json() as KPI & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      setKpis(prev => [...prev, data].sort((a, b) => a.code.localeCompare(b.code)))
      setShowForm(false)
      setForm({ ...emptyForm })
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar el KPI "${name}"? Si está vinculado a un plan no podrá eliminarse.`)) return
    const res = await fetch('/api/planning/effectiveness/kpis', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setKpis(prev => prev.filter(k => k.id !== id))
    else { const d = await res.json() as { error?: string }; alert(d.error ?? 'Error al eliminar') }
  }

  async function handleSaveFormulaType(kpiId: string) {
    const res = await fetch('/api/planning/effectiveness/kpis', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: kpiId, formula_type: editingFormulaValue || null }),
    })
    if (res.ok) {
      setKpis(prev => prev.map(k => k.id === kpiId ? { ...k, formula_type: editingFormulaValue || null } : k))
      setEditingFormulaId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Catálogo de KPIs</h2>
          <p className="text-sm text-gray-500">
            Un solo registro por indicador. Las casillas declaran a qué planes pertenece: Estratégico y Efectividad se anclan
            solos al objetivo de su dimensión; en Evaluación la pertenencia son las medidas que lo triangulan.
          </p>
        </div>
        <button onClick={() => setShowForm(o => !o)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Nuevo KPI
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800">Nuevo indicador</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Código *</label>
              <input required value={form.code}
                onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="KPI-01" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nivel *</label>
              <select value={form.level} onChange={e => setForm(p => ({ ...p, level: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de valor *</label>
              <select value={form.value_type} onChange={e => setForm(p => ({ ...p, value_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {VALUE_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Denominación KPI *</label>
              <input required value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. Diversidad internacional del claustro" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Frecuencia *</label>
              <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Cálculo automático</label>
              <select value={form.formula_type} onChange={e => setForm(p => ({ ...p, formula_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {FORMULA_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Si se selecciona, el resultado se calculará automáticamente desde la base de datos usando el periodo del dashboard.</p>
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Alcance</label>
              <textarea rows={2} value={form.scope}
                onChange={e => setForm(p => ({ ...p, scope: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Descripción del alcance y propósito de este KPI" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Fórmula (descriptiva)</label>
              <input value={form.formula}
                onChange={e => setForm(p => ({ ...p, formula: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej. Conteo distinto de nacionalidades representadas" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowForm(false); setForm({ ...emptyForm }); setError(null) }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando...' : 'Guardar KPI'}
            </button>
          </div>
        </form>
      )}

      {/* Filtro por dimensión (prefijo del código E1..E7) */}
      {!loading && kpis.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filtroDim} onChange={e => setFiltroDim(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas las dimensiones</option>
            {[...new Set(kpis.map(k => dimensionDe(k.code)))].sort().map(d => (
              <option key={d} value={d}>
                {d}{DIMENSION_NAMES[d] ? ` · ${DIMENSION_NAMES[d]}` : ''} ({kpis.filter(k => dimensionDe(k.code) === d).length})
              </option>
            ))}
          </select>
          <select value={filtroPlan} onChange={e => setFiltroPlan(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los planes</option>
            <option value="estrategico">En el Plan Estratégico ({kpis.filter(k => pert[k.id]?.estrategico).length})</option>
            <option value="efectividad">En el Plan de Efectividad ({kpis.filter(k => pert[k.id]?.efectividad).length})</option>
            <option value="evaluacion">En el Plan de Evaluación ({kpis.filter(k => (pert[k.id]?.medidas.length ?? 0) > 0).length})</option>
            <option value="ninguno">Sin ningún plan ({kpis.filter(k => !pert[k.id]?.estrategico && !pert[k.id]?.efectividad && !(pert[k.id]?.medidas.length)).length})</option>
          </select>
          {filtroDim && (
            <span className="text-xs text-gray-400">
              {kpis.filter(k => dimensionDe(k.code) === filtroDim).length} KPI(s) de {DIMENSION_NAMES[filtroDim] ?? filtroDim}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : kpis.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No hay KPIs en el catálogo. Crea el primero.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Código</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-28">Nivel</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Denominación</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Alcance</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Fórmula</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Tipo</th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-purple-700 w-20" title={ctx?.ciclo ?? undefined}>Estratégico</th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-blue-700 w-20" title={ctx?.plan_efectividad ?? undefined}>Efectividad</th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-emerald-700 w-24" title={ctx?.plan_evaluacion ?? undefined}>Evaluación</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-40">Cálculo auto</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {kpis.filter(k => !filtroDim || dimensionDe(k.code) === filtroDim).filter(k => {
                const p = pert[k.id]
                if (!filtroPlan) return true
                if (filtroPlan === 'estrategico') return !!p?.estrategico
                if (filtroPlan === 'efectividad') return !!p?.efectividad
                if (filtroPlan === 'evaluacion') return (p?.medidas.length ?? 0) > 0
                if (filtroPlan === 'ninguno') return !p?.estrategico && !p?.efectividad && !(p?.medidas.length)
                return true
              }).map(kpi => (
                <Fragment key={kpi.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{kpi.code}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[kpi.level] ?? 'bg-gray-100 text-gray-600'}`}>
                      {LEVELS.find(l => l.value === kpi.level)?.label ?? kpi.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 text-xs">{kpi.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{kpi.scope ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{kpi.formula ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {VALUE_TYPES.find(v => v.value === kpi.value_type)?.label ?? kpi.value_type}
                  </td>
                  {/* Pertenencia a los tres planes */}
                  <td className="px-2 py-3 text-center">
                    <input type="checkbox" className="w-4 h-4" disabled={busyKpi === kpi.id}
                      checked={!!pert[kpi.id]?.estrategico}
                      onChange={e => togglePlan(kpi, 'estrategico', e.target.checked)}
                      title={pert[kpi.id]?.ancla ? `Se ancla al objetivo ${pert[kpi.id]?.ancla}` : 'El código no permite derivar el objetivo'} />
                    {pert[kpi.id]?.estrategico && (
                      <button onClick={() => editarAlias(kpi)} title="Código en el plan estratégico (clic para editar)"
                        className="block mx-auto mt-0.5 text-[10px] tabular-nums text-purple-700 hover:underline">
                        {pert[kpi.id]?.estrategico?.alias ?? 'sin alias'}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <input type="checkbox" className="w-4 h-4" disabled={busyKpi === kpi.id}
                      checked={!!pert[kpi.id]?.efectividad}
                      onChange={e => togglePlan(kpi, 'efectividad', e.target.checked)}
                      title={pert[kpi.id]?.ancla ? `Se ancla al objetivo ${pert[kpi.id]?.ancla}` : 'El código no permite derivar el objetivo'} />
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button onClick={() => abrirEval(kpi)} disabled={busyKpi === kpi.id}
                      className={`text-[11px] px-2 py-0.5 rounded-full ${(pert[kpi.id]?.medidas.length ?? 0) > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'} hover:ring-1 hover:ring-emerald-300`}>
                      {(pert[kpi.id]?.medidas.length ?? 0) > 0 ? `${pert[kpi.id]?.medidas.length} medida${pert[kpi.id]?.medidas.length === 1 ? '' : 's'}` : '—'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {editingFormulaId === kpi.id ? (
                      <div className="flex gap-1">
                        <select value={editingFormulaValue} onChange={e => setEditingFormulaValue(e.target.value)}
                          className="flex-1 border border-blue-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                          {FORMULA_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                        <button onClick={() => handleSaveFormulaType(kpi.id)}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">✓</button>
                        <button onClick={() => setEditingFormulaId(null)}
                          className="px-2 py-1 border border-gray-200 text-gray-500 text-xs rounded hover:bg-gray-50">✗</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingFormulaId(kpi.id); setEditingFormulaValue(kpi.formula_type ?? '') }}
                        className="flex items-center gap-1 group">
                        {kpi.formula_type ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                            <Zap className="w-3 h-3" />
                            {FORMULA_TYPES.find(f => f.value === kpi.formula_type)?.label ?? kpi.formula_type}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 group-hover:text-blue-500">+ Asignar</span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(kpi.id, kpi.name)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
                {evalAbierto === kpi.id && (
                  <tr className="bg-emerald-50/40">
                    <td colSpan={11} className="px-4 py-3">
                      <p className="text-xs font-semibold text-emerald-800 mb-1.5">
                        Medidas del plan de evaluación que triangulan {kpi.code} — en ese plan la pertenencia ES la medida
                      </p>
                      {medidas.length === 0 ? (
                        <p className="text-xs text-gray-400">No hay medidas cargadas en el plan de evaluación.</p>
                      ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                          {medidas.map(m => (
                            <label key={m.id} className="flex items-start gap-1.5 text-xs text-gray-700 cursor-pointer">
                              <input type="checkbox" className="mt-0.5 w-3.5 h-3.5" checked={evalSel.has(m.id)}
                                onChange={e => setEvalSel(prev => { const n = new Set(prev); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n })} />
                              <span><b className="tabular-nums">{m.code}</b> {m.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => guardarEval(kpi)} disabled={busyKpi === kpi.id}
                          className="px-3 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                          {busyKpi === kpi.id ? 'Guardando…' : 'Guardar medidas'}
                        </button>
                        <button onClick={() => setEvalAbierto(null)} className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Cancelar</button>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
