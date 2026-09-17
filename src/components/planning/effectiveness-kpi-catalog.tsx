'use client'

import { Fragment, useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Zap } from 'lucide-react'

// Pertenencia de un KPI a los tres planes (17/09/2026): el catálogo es único y
// cada plan lo enlaza, SIEMPRE 1 a 1: un indicador, hasta tres códigos (uno por
// plan). Estratégico/Efectividad se anclan al objetivo de su dimensión;
// Evaluación es identidad con su ficha del IAP (I-08 = E1-I03). Corrección del
// usuario (17/09/2026): los KPIs de evaluación son KPIs de pleno derecho —
// coexisten con otro plan o son exclusivos—, nunca "medidas relacionadas".
// El CÓDIGO no es del KPI: es del KPI dentro de un plan (corrección del
// usuario, 17/09/2026). Efectividad E1-S01 (E# estrategia + I/O/S nivel),
// Estratégico E1-K4, Evaluación D-05/I-08 (directo/indirecto). El "nivel" solo
// existe para los KPIs del plan de efectividad: sale de la letra de su código.
interface Pertenencia {
  estrategico: { code: string | null } | null
  efectividad: { code: string | null; nivel: string | null } | null
  evaluacion: { code: string; tipo: string } | null
  dimension: string | null
  tiene_resultado?: boolean
}
type Plan = 'estrategico' | 'efectividad' | 'evaluacion'
const PLAN_INFO: Record<Plan, { nombre: string; ejemplo: string; pierde: string }> = {
  estrategico: { nombre: 'plan estratégico', ejemplo: 'E1-K4  (E# = estrategia, K# = correlativo)', pierde: 'su código, su vigencia por años y su responsable en el plan estratégico' },
  efectividad: { nombre: 'plan de efectividad', ejemplo: 'E1-S01  (E# = estrategia; I / O / S = institucional, operativo o estratégico; correlativo)', pierde: 'su código, su meta, responsable, estado y decisión en el plan de efectividad' },
  evaluacion: { nombre: 'plan de evaluación', ejemplo: 'D-10 si es directo · I-12 si es indirecto', pierde: 'su ficha en el plan de evaluación (propósito, meta, evidencias); si ya tiene un resultado registrado, el sistema no lo permitirá' },
}

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
  D: 'Evaluación · KPIs directos',
  I: 'Evaluación · KPIs indirectos',
}

const LEVEL_COLORS: Record<string, string> = {
  institucional: 'bg-purple-100 text-purple-700',
  estrategico: 'bg-blue-100 text-blue-700',
  operativo: 'bg-green-100 text-green-700',
}

const emptyForm = {
  name: '', formula: '', scope: '',
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
  const [ctx, setCtx] = useState<{ ciclo: string | null; plan_efectividad: string | null; plan_evaluacion: string | null } | null>(null)
  const [busyKpi, setBusyKpi] = useState<string | null>(null)
  const [filtroPlan, setFiltroPlan] = useState('')
  const [migrado, setMigrado] = useState(true)

  const cargarPert = () => fetch('/api/planning/effectiveness/kpi-plans').then(r => r.json()).then(d => {
    if (d.error) return
    setPert(d.pertenencias ?? {}); setCtx(d.contexto ?? null); setMigrado(d.migrado !== false)
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

  // Marcar un plan = darle al KPI SU CÓDIGO en ese plan. Desmarcar avisa qué se pierde.
  async function marcar(kpi: KPI, plan: Plan, on: boolean) {
    const p = pert[kpi.id]
    const info = PLAN_INFO[plan]
    if (!on) {
      const cod = p?.[plan]?.code ?? ''
      const aviso = `¿Quitar "${kpi.name}" del ${info.nombre}${cod ? ` (${cod})` : ''}?\n\nSe pierde ${info.pierde}.${plan !== 'evaluacion' && p?.tiene_resultado ? '\n\n⚠ Este KPI tiene RESULTADOS medidos: no se borran (viven por año), pero dejarán de verse en los tableros de este plan.' : ''}`
      if (!confirm(aviso)) return
      await postPlan({ kpi_id: kpi.id, plan, on: false }, kpi.id)
      return
    }
    const v = window.prompt(`Código de "${kpi.name}" en el ${info.nombre}:\n\nFormato: ${info.ejemplo}`, '')
    if (v === null || !v.trim()) return
    await postPlan({ kpi_id: kpi.id, plan, on: true, code: v.trim() }, kpi.id)
  }

  async function editarCodigo(kpi: KPI, plan: Plan) {
    const actual = pert[kpi.id]?.[plan]?.code ?? ''
    const v = window.prompt(`Código de "${kpi.name}" en el ${PLAN_INFO[plan].nombre}:\n\nFormato: ${PLAN_INFO[plan].ejemplo}`, actual)
    if (v === null || !v.trim() || v.trim().toUpperCase() === actual) return
    await postPlan({ kpi_id: kpi.id, plan, on: true, code: v.trim() }, kpi.id)
  }

  // Dimensión de un KPI: el E# de sus códigos de plan (o D/I si es exclusivo de evaluación)
  const dimDe = (k: KPI): string => pert[k.id]?.dimension ?? '—'
  const ordenCodigo = (k: KPI): string => {
    const p = pert[k.id]
    return `${dimDe(k)}|${p?.efectividad?.code ?? p?.estrategico?.code ?? p?.evaluacion?.code ?? ''}|${k.name}`
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
      setKpis(prev => [...prev, data])
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
            Un indicador es una denominación; <b>el código es del indicador dentro de cada plan</b>. Marca a qué planes pertenece y
            cada uno le pone el suyo: <span className="font-mono text-purple-700">E1-K4</span> en el estratégico,{' '}
            <span className="font-mono text-blue-700">E1-S01</span> en efectividad (E# = estrategia; I/O/S = su nivel) y{' '}
            <span className="font-mono text-emerald-700">D-05 / I-08</span> en evaluación (directo / indirecto).
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
            {/* Sin código ni nivel: el indicador nace con su denominación y recibe
                su código (y, en efectividad, su nivel I/O/S) al marcarlo en cada plan. */}
            <p className="col-span-3 text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2">
              El indicador se crea solo con su denominación. Su <b>código</b> se asigna después, al marcar a qué plan pertenece:
              cada plan le pone el suyo (E1-S01 en efectividad, E1-K4 en el estratégico, D-05 / I-08 en evaluación).
            </p>
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
            {[...new Set(kpis.map(k => dimDe(k)))].sort().map(d => (
              <option key={d} value={d}>
                {d === '—' ? 'Sin plan asignado' : d}{DIMENSION_NAMES[d] ? ` · ${DIMENSION_NAMES[d]}` : ''} ({kpis.filter(k => dimDe(k) === d).length})
              </option>
            ))}
          </select>
          <select value={filtroPlan} onChange={e => setFiltroPlan(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los planes</option>
            <option value="estrategico">En el Plan Estratégico ({kpis.filter(k => pert[k.id]?.estrategico).length})</option>
            <option value="efectividad">En el Plan de Efectividad ({kpis.filter(k => pert[k.id]?.efectividad).length})</option>
            <option value="evaluacion">En el Plan de Evaluación ({kpis.filter(k => pert[k.id]?.evaluacion).length})</option>
            <option value="ninguno">Sin ningún plan ({kpis.filter(k => !pert[k.id]?.estrategico && !pert[k.id]?.efectividad && !pert[k.id]?.evaluacion).length})</option>
          </select>
          {filtroDim && (
            <span className="text-xs text-gray-400">
              {kpis.filter(k => dimDe(k) === filtroDim).length} KPI(s) de {DIMENSION_NAMES[filtroDim] ?? filtroDim}
            </span>
          )}
        </div>
      )}

      {!migrado && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Falta correr la migración <span className="font-mono">supabase/kpi_codigo_por_plan.sql</span>: hasta entonces los códigos de
          efectividad se leen del identificador interno y no se pueden editar.
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Denominación</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Alcance</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Fórmula</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-24">Tipo</th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-purple-700 w-24" title={ctx?.ciclo ?? undefined}>Estratégico<span className="block font-normal text-[10px] text-purple-400">E#-K#</span></th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-blue-700 w-28" title={ctx?.plan_efectividad ?? undefined}>Efectividad<span className="block font-normal text-[10px] text-blue-400">E#-I/O/S##</span></th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-emerald-700 w-24" title={ctx?.plan_evaluacion ?? undefined}>Evaluación<span className="block font-normal text-[10px] text-emerald-400">D-## · I-##</span></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-40">Cálculo auto</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...kpis].sort((a, b) => ordenCodigo(a).localeCompare(ordenCodigo(b))).filter(k => !filtroDim || dimDe(k) === filtroDim).filter(k => {
                const p = pert[k.id]
                if (!filtroPlan) return true
                if (filtroPlan === 'estrategico') return !!p?.estrategico
                if (filtroPlan === 'efectividad') return !!p?.efectividad
                if (filtroPlan === 'evaluacion') return !!p?.evaluacion
                if (filtroPlan === 'ninguno') return !p?.estrategico && !p?.efectividad && !p?.evaluacion
                return true
              }).map(kpi => (
                <Fragment key={kpi.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 text-xs font-medium">{kpi.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{kpi.scope ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{kpi.formula ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {VALUE_TYPES.find(v => v.value === kpi.value_type)?.label ?? kpi.value_type}
                  </td>
                  {/* Pertenencia a los tres planes */}
                  {/* Cada plan: casilla + el código del KPI EN ESE PLAN (clic para editarlo) */}
                  <td className="px-2 py-3 text-center">
                    <input type="checkbox" className="w-4 h-4" disabled={busyKpi === kpi.id}
                      checked={!!pert[kpi.id]?.estrategico}
                      onChange={e => marcar(kpi, 'estrategico', e.target.checked)}
                      title="Al marcar se pide su código en el plan estratégico (E#-K#); el E# lo ancla al objetivo de esa estrategia" />
                    {pert[kpi.id]?.estrategico && (
                      <button onClick={() => editarCodigo(kpi, 'estrategico')} title="Código en el plan estratégico (clic para editar)"
                        className="block mx-auto mt-0.5 text-[11px] font-mono font-medium text-purple-700 hover:underline">
                        {pert[kpi.id]?.estrategico?.code ?? 'sin código'}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <input type="checkbox" className="w-4 h-4" disabled={busyKpi === kpi.id}
                      checked={!!pert[kpi.id]?.efectividad}
                      onChange={e => marcar(kpi, 'efectividad', e.target.checked)}
                      title="Al marcar se pide su código en el plan de efectividad (E#-I/O/S##); la letra define su nivel y el E# lo ancla al objetivo" />
                    {pert[kpi.id]?.efectividad && (
                      <>
                        <button onClick={() => editarCodigo(kpi, 'efectividad')} title="Código en el plan de efectividad (clic para editar)"
                          className="block mx-auto mt-0.5 text-[11px] font-mono font-medium text-blue-700 hover:underline">
                          {pert[kpi.id]?.efectividad?.code ?? 'sin código'}
                        </button>
                        {/* El nivel NO es del KPI: sale de la letra I/O/S de este código */}
                        {pert[kpi.id]?.efectividad?.nivel && (
                          <span className={`inline-flex mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${LEVEL_COLORS[pert[kpi.id]!.efectividad!.nivel!] ?? 'bg-gray-100 text-gray-600'}`}>
                            {LEVELS.find(l => l.value === pert[kpi.id]?.efectividad?.nivel)?.label}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <input type="checkbox" className="w-4 h-4" disabled={busyKpi === kpi.id}
                      checked={!!pert[kpi.id]?.evaluacion}
                      onChange={e => marcar(kpi, 'evaluacion', e.target.checked)}
                      title="Al marcar se pide su código en el plan de evaluación (D-## directo · I-## indirecto)" />
                    {pert[kpi.id]?.evaluacion && (
                      <>
                        <button onClick={() => editarCodigo(kpi, 'evaluacion')} title="Código en el plan de evaluación (clic para editar)"
                          className="block mx-auto mt-0.5 text-[11px] font-mono font-medium text-emerald-700 hover:underline">
                          {pert[kpi.id]?.evaluacion?.code}
                        </button>
                        <span className="text-[10px] text-emerald-600/70">{pert[kpi.id]?.evaluacion?.tipo}</span>
                      </>
                    )}
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
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
