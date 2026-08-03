'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'

interface Fila {
  category_id: string; categoria: string
  estudiantes: number; con_cuenta: number; sin_cuenta: number
  sin_acceso_por_deuda: number; exceptuados: number
  campus_externo: number; activos_30d: number; nunca_entraron: number
}
interface Corrida {
  ran_at: string; ok: boolean
  summary: { evaluados?: number; suspendidas?: number; reactivadas?: number; errores?: number } | null
  errors: string[] | null
}

const num = (n: number) => n.toLocaleString('es-PE')
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a * 100) / b)}%` : '—')

export function MoodleStatus() {
  const [filas, setFilas] = useState<Fila[]>([])
  const [total, setTotal] = useState<Fila | null>(null)
  const [corrida, setCorrida] = useState<Corrida | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const traer = async () => {
    setCargando(true); setError(null)
    try {
      const r = await fetch('/api/reports/moodle-status', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo cargar')
      setFilas(j.filas ?? []); setTotal(j.total ?? null); setCorrida(j.ultima_reconciliacion ?? null)
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => { traer() }, [])

  const dias = corrida ? Math.floor((Date.now() - new Date(corrida.ran_at).getTime()) / 86400000) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={traer} disabled={cargando}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Recalcular
        </button>
        {cargando && <span className="text-sm text-slate-500">Consultando el campus…</span>}
      </div>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {/* Última reconciliación: sin esto no se sabe si lo de abajo es de hoy o
          de hace tres semanas. */}
      <div className={`rounded-lg border p-4 ${
        !corrida ? 'border-amber-300 bg-amber-50'
        : dias !== null && dias > 1 ? 'border-amber-300 bg-amber-50'
        : corrida.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
        <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
          {!corrida ? <Clock className="h-4 w-4 text-amber-600" />
            : corrida.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            : <AlertTriangle className="h-4 w-4 text-red-600" />}
          Última reconciliación de accesos
        </p>
        {!corrida ? (
          <p className="mt-1 text-sm text-slate-600">
            Todavía no hay ninguna corrida registrada. El cron corre cada día a la 01:00.
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-700">
            {new Date(corrida.ran_at).toLocaleString('es-PE', { dateStyle: 'full', timeStyle: 'short' })}
            {dias !== null && dias > 1 && <span className="font-medium text-amber-800"> · hace {dias} días</span>}
            {corrida.summary && (
              <span className="block text-slate-600">
                {num(corrida.summary.evaluados ?? 0)} evaluados · {num(corrida.summary.suspendidas ?? 0)} suspendidas ·{' '}
                {num(corrida.summary.reactivadas ?? 0)} reactivadas
                {!!corrida.summary.errores && <span className="text-red-700"> · {corrida.summary.errores} con error</span>}
              </span>
            )}
          </p>
        )}
        {!!corrida?.errors?.length && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-slate-500">Ver los errores</summary>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              {corrida.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </details>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Categoría de programa</th>
              <th className="px-3 py-2 text-right">Estudiantes</th>
              <th className="px-3 py-2 text-right">Con cuenta</th>
              <th className="px-3 py-2 text-right">Sin cuenta</th>
              <th className="px-3 py-2 text-right">Sin acceso por deuda</th>
              <th className="px-3 py-2 text-right">Con tolerancia</th>
              <th className="px-3 py-2 text-right">Campus externo</th>
              <th className="px-3 py-2 text-right">Entraron (30 días)</th>
              <th className="px-3 py-2 text-right">Nunca entraron</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.category_id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800">{f.categoria}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(f.estudiantes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(f.con_cuenta)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${f.sin_cuenta ? 'text-amber-700' : 'text-slate-300'}`}>
                  {f.sin_cuenta ? num(f.sin_cuenta) : '—'}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${f.sin_acceso_por_deuda ? 'font-medium text-red-700' : 'text-slate-300'}`}>
                  {f.sin_acceso_por_deuda ? num(f.sin_acceso_por_deuda) : '—'}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${f.exceptuados ? 'text-sky-700' : 'text-slate-300'}`}>
                  {f.exceptuados ? num(f.exceptuados) : '—'}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${f.campus_externo ? 'text-slate-600' : 'text-slate-300'}`}>
                  {f.campus_externo ? num(f.campus_externo) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(f.activos_30d)}
                  <span className="ml-1 text-xs text-slate-400">{pct(f.activos_30d, f.con_cuenta)}</span>
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${f.nunca_entraron ? 'text-amber-700' : 'text-slate-300'}`}>
                  {f.nunca_entraron ? num(f.nunca_entraron) : '—'}
                </td>
              </tr>
            ))}
            {total && (
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
                <td className="px-3 py-2 text-slate-900">{total.categoria} <span className="text-xs font-normal text-slate-400">(personas)</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{num(total.estudiantes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(total.con_cuenta)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(total.sin_cuenta)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-700">{num(total.sin_acceso_por_deuda)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-sky-700">{num(total.exceptuados)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(total.campus_externo)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(total.activos_30d)}
                  <span className="ml-1 text-xs font-normal text-slate-400">{pct(total.activos_30d, total.con_cuenta)}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700">{num(total.nunca_entraron)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        <b>Sin acceso por deuda</b> es lo que el estudiante se encuentra al intentar entrar: el estado real de su cuenta
        en el campus, no la intención del ERP. <b>Con tolerancia</b> son los que deben y tienen una excepción vigente
        otorgada desde el ERP. <b>Entraron</b> y <b>Nunca entraron</b> salen del último acceso que registra Moodle —
        una fila puede sumar en varias categorías si el estudiante cursa dos programas; el total cuenta personas.
      </p>
    </div>
  )
}
