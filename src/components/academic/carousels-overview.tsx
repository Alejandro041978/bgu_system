'use client'

import { useEffect, useState } from 'react'
import { Loader2, Users, CheckCircle2, AlertTriangle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Cobertura de carruseles — SOLO LECTURA (17/09/2026, regla del usuario: la
// vendedora carga, el pago ejecuta, los reportes reflejan). Antes esta página
// colocaba estudiantes (en línea y con la "Colocación automática"); esas
// acciones se retiraron: la colocación la ejecuta la activación de la
// matrícula con el carrusel cargado en ella, y lo cargado se corrige en la
// ficha del estudiante.
// ---------------------------------------------------------------------------
interface Ref { id: string; name: string }
interface GroupRow {
  id: string; program: string; label: string
  position: number | null; is_last: boolean
  asignaturas: number; activos: number; completados: number
}
interface Unplaced {
  student_id: string; name: string; document: string
  program_id: string; program: string
}
interface Data {
  categories: Ref[]; groups: GroupRow[]; unplaced: Unplaced[]
  resumen?: { carruseles: number; activos_total: number; activos_en_carrusel: number; sin_carrusel: number }
}

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export function CarouselsOverview() {
  const [data, setData] = useState<Data | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/academic/carousels-overview${categoryId ? `?category_id=${categoryId}` : ''}`)
      .then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false) })
  }, [categoryId])

  // Agrupar carruseles por programa para pintar la secuencia
  const byProgram = new Map<string, GroupRow[]>()
  for (const g of data?.groups ?? []) {
    if (!byProgram.has(g.program)) byProgram.set(g.program, [])
    byProgram.get(g.program)!.push(g)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[280px]">
          <span className="block text-xs text-gray-500 mb-1">Categoría de programas</span>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inp}>
            <option value="">Seleccionar…</option>
            {(data?.categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {data?.resumen && (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm">
              <Users className="w-4 h-4 text-gray-400" />
              <b>{data.resumen.carruseles}</b> carruseles
            </span>
            <span className="inline-flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              <b>{data.resumen.activos_en_carrusel}</b> de <b>{data.resumen.activos_total}</b> matrículas activas en carrusel
            </span>
            {data.resumen.sin_carrusel > 0 ? (
              <span className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                <b>{data.resumen.sin_carrusel}</b> sin ruta asignada
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm text-green-700">
                Todos con ruta ✓
              </span>
            )}
          </div>
        )}
      </div>

      {loading && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {!loading && categoryId && byProgram.size === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">Esta categoría no tiene carruseles todavía.</p>
      )}

      {/* Carruseles por programa */}
      {!loading && [...byProgram.entries()].map(([program, rows]) => (
        <div key={program} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-800">{program}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2">Carrusel</th>
                <th className="text-center px-4 py-2 w-32">Secuencia</th>
                <th className="text-right px-4 py-2 w-28">Asignaturas</th>
                <th className="text-right px-4 py-2 w-28">Cursando</th>
                <th className="text-right px-4 py-2 w-28">Completaron</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(g => (
                <tr key={g.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5">
                    <a href={`/academic/groups/${g.id}`} className="text-blue-600 hover:underline">{g.label}</a>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-gray-500">
                    {g.position ? `${g.position}º${g.is_last ? ' · último' : ''}` : '—'}
                  </td>
                  {/* Un carrusel sin asignaturas no es una ruta: quien esté
                      dentro no cursa nada y el motor no lo hace avanzar nunca. */}
                  <td className={`px-4 py-2.5 text-right ${g.asignaturas ? 'text-gray-600' : 'text-amber-700 font-medium'}`}>
                    {g.asignaturas ? g.asignaturas : (g.activos > 0 ? '0 ⚠' : '0')}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{g.activos}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{g.completados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Activos sin carrusel — reflejo: se señala, no se corrige aquí */}
      {!loading && (data?.unplaced.length ?? 0) > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-amber-100 bg-amber-50">
            <p className="text-sm font-semibold text-amber-800">
              ⚠ Activos sin ruta asignada ({data!.unplaced.length})
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Están matriculados y activos pero sin colocación en carrusel. Se corrige en la ficha del estudiante: cargar
              el carrusel de entrada en su matrícula y re-ejecutar la activación.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2">Estudiante</th>
                <th className="text-left px-4 py-2">Documento</th>
                <th className="text-left px-4 py-2">Programa</th>
                <th className="text-left px-4 py-2 w-40">Dónde se corrige</th>
              </tr>
            </thead>
            <tbody>
              {data!.unplaced.map(u => (
                <tr key={`${u.student_id}|${u.program_id}`} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 text-gray-800">{u.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{u.document}</td>
                  <td className="px-4 py-2.5 text-gray-600">{u.program}</td>
                  <td className="px-4 py-2.5">
                    <a href={`/academic/students?id=${u.student_id}`} className="text-xs text-blue-600 hover:underline">Ficha del estudiante</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Página de solo lectura. La colocación en carrusel la ejecuta la activación de la matrícula (pago de los conceptos
        iniciales) con el carrusel cargado al matricular.
      </p>
    </div>
  )
}
