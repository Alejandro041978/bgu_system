'use client'

import { useEffect, useState } from 'react'

// Tipos y carga compartidos por las tres vistas del IAP.
export interface Benchmark { scope: string; value: number; operator: string; note: string | null }
export interface Medida {
  id: string; code: string; name: string; tipo: 'directa' | 'indirecta'
  frecuencia: string | null; ventana: string | null
  unidad: string | null; fuente_dato: string | null
  objetivos: string[]; benchmarks: Benchmark[]
  indicador: { id: string; code: string; name: string; source: string } | null
  resultado: number | null; cumple: boolean | null
}
export interface Objetivo { code: string; name: string; del_iap: boolean; medidas: string[] }
export interface FilaCalendario {
  seq: number; periodo: string; actividad: string
  medidas: string[]; responsable: string | null; desconocidas: string[]
}
export interface IAP {
  plan: { name: string; version: string; doc_owner: string | null; desde: string | null; hasta: string | null }
  anio: { id: string; etiqueta: string; start_date: string; end_date: string } | null
  anios: { id: string; etiqueta: string }[]
  cobertura: {
    medidas: number; directas: number; indirectas: number
    con_fuente: number; sin_fuente: number; con_resultado: number
    cumplen: number; no_cumplen: number; calendario_con_codigos_rotos: number
  }
  objetivos: Objetivo[]
  medidas: Medida[]
  calendario: FilaCalendario[]
}

export function useIAP() {
  const [d, setD] = useState<IAP | null>(null)
  const [anioId, setAnioId] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const traer = async (id?: string) => {
    setCargando(true); setError(null)
    try {
      const r = await fetch(`/api/planning/assessment${id ? `?academic_year_id=${id}` : ''}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      setD(j); setAnioId(j.anio?.id ?? '')
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => { traer() }, [])
  return { d, anioId, cargando, error, traer }
}

export const FUENTE: Record<string, string> = {
  formula: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  encuesta: 'bg-sky-50 text-sky-700 border-sky-200',
  rubrica: 'bg-violet-50 text-violet-700 border-violet-200',
  manual: 'bg-gray-50 text-gray-600 border-gray-200',
}

export function SelectorAnio(
  { d, anioId, cargando, traer }:
  { d: IAP; anioId: string; cargando: boolean; traer: (id?: string) => void },
) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">{d.plan.name}</p>
        <p className="text-xs text-gray-500">
          Versión {d.plan.version}{d.plan.doc_owner ? ` · ${d.plan.doc_owner}` : ''}
        </p>
      </div>
      <select value={anioId} onChange={e => traer(e.target.value)} disabled={cargando}
        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm">
        {d.anios.map(y => <option key={y.id} value={y.id}>Año académico {y.etiqueta}</option>)}
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
