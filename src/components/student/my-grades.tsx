'use client'

import { useEffect, useState } from 'react'
import { Loader2, GraduationCap } from 'lucide-react'

interface Row {
  code: string | null; name: string; credits: number | null
  status: string; grade: number | null
}
interface Summary {
  transfer: number; validation: number; aprobado: number
  desaprobado: number; en_proceso: number; pendiente: number; total: number
}
interface Programa { id: string; name: string }
interface Data {
  programas: Programa[]
  programa_id?: string
  acta: { student: { name: string }; program: { name: string }; courses: Row[]; summary: Summary } | null
}

const STATUS: Record<string, { label: string; cls: string; nota: string }> = {
  transfer:    { label: 'Transfer Credit', cls: 'bg-indigo-50 text-indigo-700', nota: 'text-indigo-600' },
  validation:  { label: 'Validation',      cls: 'bg-purple-50 text-purple-700', nota: 'text-purple-600' },
  aprobado:    { label: 'Aprobado',        cls: 'bg-green-50 text-green-700',   nota: 'text-gray-800' },
  desaprobado: { label: 'Desaprobado',     cls: 'bg-red-50 text-red-700',       nota: 'text-red-600' },
  en_proceso:  { label: 'En proceso',      cls: 'bg-amber-50 text-amber-700',   nota: 'text-gray-800' },
  pendiente:   { label: 'Pendiente',       cls: 'bg-gray-100 text-gray-500',    nota: 'text-gray-800' },
}

export function MyGrades() {
  const [d, setD] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verConvalidadas, setVerConvalidadas] = useState(true)

  const traer = async (programId?: string) => {
    setCargando(true); setError(null)
    try {
      const r = await fetch(`/api/student/acta${programId ? `?program_id=${programId}` : ''}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudieron cargar tus notas')
      setD(j)
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    setCargando(false)
  }
  useEffect(() => { traer() }, [])

  if (cargando && !d) return <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-500" /></div>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  if (!d) return null

  if (!d.programas.length || !d.acta) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
        <GraduationCap className="mx-auto mb-3 h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-400">Todavía no hay un programa matriculado con notas para mostrar.</p>
      </div>
    )
  }

  const s = d.acta.summary
  // Las convalidadas se cuentan aparte para que el filtro tenga sentido: son
  // asignaturas que ya trae aprobadas de otra institución, no cursos suyos.
  const convalidadas = s.transfer + s.validation
  const filas = verConvalidadas
    ? d.acta.courses
    : d.acta.courses.filter(c => c.status !== 'transfer' && c.status !== 'validation')

  const chips: [string, number, string][] = [
    ['Transfer Credit', s.transfer, 'bg-indigo-50 text-indigo-700 border-indigo-100'],
    ['Validation', s.validation, 'bg-purple-50 text-purple-700 border-purple-100'],
    ['Aprobadas', s.aprobado, 'bg-green-50 text-green-700 border-green-100'],
    ['Desaprobadas', s.desaprobado, 'bg-red-50 text-red-700 border-red-100'],
    ['En proceso', s.en_proceso, 'bg-amber-50 text-amber-700 border-amber-100'],
    ['Pendientes', s.pendiente, 'bg-gray-50 text-gray-600 border-gray-200'],
    ['Total', s.total, 'bg-blue-50 text-blue-700 border-blue-100'],
  ]

  return (
    <div className="space-y-4">
      {d.programas.length > 1 ? (
        <select value={d.programa_id} onChange={e => traer(e.target.value)} disabled={cargando}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          {d.programas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : (
        <p className="text-sm font-medium text-gray-700">{d.acta.program.name}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {chips.map(([label, n, cls]) => (
          <div key={label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${cls}`}>
            <span className="text-lg font-bold leading-none">{n}</span>
            <span className="text-xs font-medium">{label}</span>
          </div>
        ))}
      </div>

      {convalidadas > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={verConvalidadas} onChange={e => setVerConvalidadas(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300" />
          Mostrar las {convalidadas} asignaturas convalidadas
        </label>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Asignatura</th>
              <th className="w-16 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Cr.</th>
              <th className="w-24 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Nota</th>
              <th className="w-40 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filas.map((c, i) => {
              const st = STATUS[c.status] ?? STATUS.pendiente
              return (
                <tr key={i} className="hover:bg-gray-50/50">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-gray-800">{c.name}</p>
                    {c.code && <p className="text-xs text-gray-400">{c.code}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-500">{c.credits ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    {c.grade != null
                      ? <span className={`font-semibold ${st.nota}`}>{c.grade}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!filas.length && (
          <p className="py-10 text-center text-sm text-gray-400">
            No hay asignaturas que mostrar con este filtro.
          </p>
        )}
      </div>
    </div>
  )
}
