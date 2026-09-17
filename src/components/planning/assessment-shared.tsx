'use client'

import { useEffect, useState } from 'react'

// Tipos y carga compartidos por las tres vistas del IAP.
export interface Benchmark { scope: string; value: number; operator: string; note: string | null }
export type Estado = 'cumplido' | 'parcial' | 'no_cumplido' | 'sin_datos' | 'no_aplicable'
export interface Evidencia { label: string; url: string | null }
export interface Medida {
  id: string; code: string; name: string; tipo: 'directa' | 'indirecta'
  frecuencia: string | null; ventana: string | null
  unidad: string | null; fuente_dato: string | null
  proposito: string | null; dato_minimo: string | null; evidencia_esperada: string | null
  tipo_cruce: string | null; sin_cruce: string | null; uso_esperado: string | null
  kpis_efectividad: string[]; kpis_estrategicos: string[]
  // Cruces resueltos por enlace (iap_measure_kpis); vacío = usar los textos
  kpis: { code: string; name: string; estrategico: boolean; alias: string | null }[]
  objetivos: string[]; benchmarks: Benchmark[]
  binding: 'erp_formula' | 'externo' | 'encuesta' | 'rubrica' | 'manual' | 'pendiente'
  meta_texto: string | null; meta_valor: number | null; meta_operador: string
  responsable: string | null
  resultado: number | null; resultado_texto: string | null
  estado: Estado | null
  resultado_erp: number | null; discrepa: boolean
  decision: string | null
  evidencias: Evidencia[]
  indicador: { id: string; code: string; name: string; source: string } | null
}
export interface EstadoDef { code: string; label: string; criterio: string | null; tratamiento: string | null }
export interface Objetivo { code: string; name: string; del_iap: boolean; medidas: string[] }
export interface FilaCalendario {
  seq: number; periodo: string; actividad: string
  medidas: string[]; responsable: string | null; desconocidas: string[]
}
export interface PlanResumen { id: string; name: string; anio: string | null; medidas: number }
export interface Disponible { indicator_id: string; code: string; name: string; tipo: 'directa' | 'indirecta' }
export interface IAP {
  sin_planes?: boolean
  planes: PlanResumen[]
  anios_sin_plan: { id: string; etiqueta: string }[]
  disponibles: Disponible[]
  plan: {
    id: string; name: string; version: string; doc_owner: string | null
    desde: string | null; hasta: string | null; cubre_el_anio: boolean
  }
  anio: { id: string; etiqueta: string; start_date: string; end_date: string } | null
  anios: { id: string; etiqueta: string }[]
  cobertura: {
    medidas: number; directas: number; indirectas: number
    del_erp: number; externos: number; pendientes: number
    con_resultado: number; con_evidencia: number
    cumplidos: number; parciales: number; no_cumplidos: number
    sin_datos: number; no_aplicables: number
    discrepancias: number; calendario_con_codigos_rotos: number
  }
  escala: EstadoDef[]
  objetivos: Objetivo[]
  medidas: Medida[]
  calendario: FilaCalendario[]
}

// La escala del documento, con sus colores. sin_datos NO es rojo: no es un
// incumplimiento, es un vacío de evidencia — y pintarlo igual que un
// incumplimiento es justo el error que el propio instrumento advierte.
export const ESTADO: Record<string, { txt: string; cls: string }> = {
  cumplido:     { txt: 'Cumplido',        cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  parcial:      { txt: 'Parcial',         cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  no_cumplido:  { txt: 'No cumplido',     cls: 'border-red-200 bg-red-50 text-red-700' },
  sin_datos:    { txt: 'Sin datos',       cls: 'border-slate-300 bg-slate-100 text-slate-600' },
  no_aplicable: { txt: 'No aplicable',    cls: 'border-slate-200 bg-white text-slate-400' },
}

export const BINDING: Record<string, { txt: string; cls: string }> = {
  erp_formula: { txt: 'ERP',       cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  externo:     { txt: 'externo',   cls: 'border-orange-200 bg-orange-50 text-orange-700' },
  encuesta:    { txt: 'encuesta',  cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  rubrica:     { txt: 'rúbrica',   cls: 'border-violet-200 bg-violet-50 text-violet-700' },
  manual:      { txt: 'manual',    cls: 'border-gray-200 bg-gray-50 text-gray-600' },
  pendiente:   { txt: 'pendiente', cls: 'border-dashed border-gray-300 bg-white text-gray-400' },
}

// Se elige un PLAN (no un año): el IAP es anual y solo existen los creados.
export function useIAP() {
  const [d, setD] = useState<IAP | null>(null)
  const [planId, setPlanId] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const traer = async (id?: string) => {
    setCargando(true); setError(null)
    try {
      const r = await fetch(`/api/planning/assessment${id ? `?plan_id=${id}` : ''}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      setD(j); setPlanId(j.plan?.id ?? '')
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => { traer() }, [])
  return { d, planId, cargando, error, traer }
}

export const FUENTE: Record<string, string> = {
  formula: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  encuesta: 'bg-sky-50 text-sky-700 border-sky-200',
  rubrica: 'bg-violet-50 text-violet-700 border-violet-200',
  manual: 'bg-gray-50 text-gray-600 border-gray-200',
}

export function SelectorPlan(
  { d, planId, cargando, traer }:
  { d: IAP; planId: string; cargando: boolean; traer: (id?: string) => void },
) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">{d.plan.name}</p>
        <p className="text-xs text-gray-500">
          Versión {d.plan.version}{d.plan.doc_owner ? ` · ${d.plan.doc_owner}` : ''}
          {d.anio ? ` · año académico ${d.anio.etiqueta}` : ''}
        </p>
      </div>
      {/* Solo los planes que existen: sin años "prestados" */}
      <select value={planId} onChange={e => traer(e.target.value)} disabled={cargando}
        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm">
        {d.planes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  )
}

export function Tarjeta(
  { titulo, valor, detalle, alerta }: { titulo: string; valor: number | string; detalle?: string; alerta?: boolean },
) {
  return (
    <div className={`rounded-lg border p-4 ${alerta ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className={`text-2xl font-bold tabular-nums ${alerta ? 'text-amber-800' : 'text-gray-900'}`}>{valor}</p>
      {detalle && <p className="text-[11px] text-gray-400">{detalle}</p>}
    </div>
  )
}
