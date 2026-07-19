'use client'

import { useEffect, useState } from 'react'
import { Loader2, BookOpen, ChevronDown, ChevronRight, Grid3X3 } from 'lucide-react'

interface Program { id: string; name: string; category: string }
interface Course { id: string; code: string | null; name: string; level: number | null }
interface Row {
  document: string; student_name: string
  term_year: number | null; term_block: string | null
  final_grade: number | null; retake_grade: number | null; efectiva: number | null
  estado: 'aprobado' | 'desaprobado' | 'en_curso'
  source: string | null; edited: boolean; locked: boolean
}
interface Acta {
  course: { id: string; code: string | null; name: string; program: string; passing: number | null }
  resumen: { total: number; aprobados: number; desaprobados: number; en_curso: number; promedio: number | null }
  terms: string[]
  rows: Row[]
}
interface Evaluacion { n: number; pct: number | null; val: number | null; desc: string }
interface DetalleRow {
  student_id: string; name: string; document: string
  term_year: number | null; term_block: string | null
  final_grade: number | null; retake_grade: number | null
  evaluaciones: Evaluacion[]
}

const SOURCE: Record<string, string> = {
  systemactiva: 'Activa', moodle: 'Moodle', csv: 'CSV', convalidacion: 'Convalidada', validacion: 'Validada',
}

export function CourseReport() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [programId, setProgramId] = useState('')
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState('')
  const [acta, setActa] = useState<Acta | null>(null)
  const [loading, setLoading] = useState(false)
  const [term, setTerm] = useState('todos')
  const [detalle, setDetalle] = useState<DetalleRow[] | null>(null)
  const [loadingDet, setLoadingDet] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [matriz, setMatriz] = useState(false)

  async function cargarDetalle(): Promise<DetalleRow[]> {
    if (detalle) return detalle
    setLoadingDet(true)
    const d = await fetch(`/api/academic/course-report?course_id=${courseId}&detalle=1`).then(r => r.json())
    setLoadingDet(false)
    const rows = d.detalle ?? []
    setDetalle(rows)
    return rows
  }

  useEffect(() => {
    fetch('/api/academic/course-report').then(r => r.json()).then(d => setPrograms(d.programs ?? []))
  }, [])

  useEffect(() => {
    setCourses([]); setCourseId(''); setActa(null)
    if (!programId) return
    fetch(`/api/academic/course-report?program_id=${programId}`).then(r => r.json()).then(d => setCourses(d.courses ?? []))
  }, [programId])

  useEffect(() => {
    setActa(null); setTerm('todos'); setDetalle(null); setExpandido(null); setMatriz(false)
    if (!courseId) return
    setLoading(true)
    fetch(`/api/academic/course-report?course_id=${courseId}`).then(r => r.json()).then(d => {
      if (!d.error) setActa(d)
      setLoading(false)
    })
  }, [courseId])

  const visibles = (acta?.rows ?? []).filter(r =>
    term === 'todos' || `${r.term_year ?? '—'} · ${r.term_block ?? '—'}` === term)

  async function toggleExpand(r: Row) {
    const key = `${r.document}|${r.term_year}|${r.term_block}`
    if (expandido === key) { setExpandido(null); return }
    await cargarDetalle()
    setExpandido(key)
  }
  const detalleDe = (r: Row): DetalleRow | null =>
    (detalle ?? []).find(d => d.document === r.document && d.term_year === r.term_year && d.term_block === r.term_block) ?? null

  // Matriz del término elegido: columnas = evaluaciones (en orden), filas = estudiantes
  const detTerm = (detalle ?? []).filter(d => term !== 'todos' && `${d.term_year ?? '—'} · ${d.term_block ?? '—'}` === term)
  const columnas: string[] = []
  {
    const orden = new Map<string, number>()
    for (const d of detTerm) for (const e of d.evaluaciones) {
      if (!orden.has(e.desc)) orden.set(e.desc, e.n)
    }
    columnas.push(...[...orden.entries()].sort((a, b) => a[1] - b[1]).map(([desc]) => desc))
  }
  const pctDe = (desc: string): number | null => {
    for (const d of detTerm) { const e = d.evaluaciones.find(x => x.desc === desc); if (e?.pct != null) return e.pct }
    return null
  }

  return (
    <div className="space-y-4">
      {/* Selección */}
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-[220px]">
          <span className="block text-xs text-gray-500 mb-1">Programa</span>
          <select value={programId} onChange={e => setProgramId(e.target.value)} className={inp}>
            <option value="">Seleccionar…</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}{p.category ? ` — ${p.category}` : ''}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[220px]">
          <span className="block text-xs text-gray-500 mb-1">Asignatura</span>
          <select value={courseId} onChange={e => setCourseId(e.target.value)} className={inp} disabled={!programId}>
            <option value="">Seleccionar…</option>
            {courses.map(c => <option key={c.id} value={c.id}>{[c.code, c.name].filter(Boolean).join(' · ')}</option>)}
          </select>
        </label>
      </div>

      {loading && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {acta && (
        <>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-500" />
            <p className="text-sm font-semibold text-gray-900">{[acta.course.code, acta.course.name].filter(Boolean).join(' · ')}</p>
            <p className="text-xs text-gray-400">{acta.course.program}{acta.course.passing != null ? ` · aprueba con ${acta.course.passing}` : ''}</p>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-2xl font-bold text-gray-900">{acta.resumen.total}</p><p className="text-xs text-gray-500">Registros</p></div>
            <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-2xl font-bold text-green-700">{acta.resumen.aprobados}</p><p className="text-xs text-green-700">Aprobados</p></div>
            <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-2xl font-bold text-rose-700">{acta.resumen.desaprobados}</p><p className="text-xs text-rose-700">Desaprobados</p></div>
            <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-2xl font-bold text-amber-700">{acta.resumen.en_curso}</p><p className="text-xs text-amber-700">En curso</p></div>
            <div className="rounded-lg p-3 border border-gray-200 bg-white"><p className="text-2xl font-bold text-gray-800">{acta.resumen.promedio ?? '—'}</p><p className="text-xs text-gray-500">Promedio</p></div>
          </div>

          {/* Filtro por término + matriz */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button onClick={() => { setTerm('todos'); setMatriz(false) }} className={`px-2.5 py-1 rounded-full border ${term === 'todos' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-600'}`}>Todos los términos</button>
            {acta.terms.map(t => (
              <button key={t} onClick={() => setTerm(t)} className={`px-2.5 py-1 rounded-full border ${term === t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-600'}`}>{t}</button>
            ))}
            <span className="flex-1" />
            <button
              onClick={async () => { if (!matriz) await cargarDetalle(); setMatriz(m => !m) }}
              disabled={term === 'todos' || loadingDet}
              title={term === 'todos' ? 'Elige un término para ver la matriz de su cohorte' : ''}
              className={`px-2.5 py-1 rounded-full border flex items-center gap-1 disabled:opacity-40 ${matriz ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-600'}`}>
              {loadingDet ? <Loader2 className="w-3 h-3 animate-spin" /> : <Grid3X3 className="w-3 h-3" />}
              {matriz ? 'Volver al acta' : 'Matriz de evaluaciones'}
            </button>
          </div>

          {/* Matriz del grupo (término elegido): estudiantes × evaluaciones */}
          {matriz && term !== 'todos' ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="text-sm min-w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-3 py-2 sticky left-0 bg-gray-50 z-10 min-w-[220px]">Estudiante</th>
                    {columnas.map(c => (
                      <th key={c} className="px-2 py-2 text-center min-w-[64px] normal-case">
                        <span className="block max-w-[110px] mx-auto whitespace-normal leading-tight text-[10px]">{c}</span>
                        {pctDe(c) != null && <span className="text-[9px] text-gray-400">{pctDe(c)}%</span>}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right">Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {detTerm.map(d => (
                    <tr key={d.student_id + String(d.term_block)} className="hover:bg-gray-50/50">
                      <td className="px-3 py-1.5 sticky left-0 bg-white z-10 whitespace-nowrap">
                        <p className="text-gray-800 text-xs">{d.name}</p>
                        <p className="text-[10px] text-gray-400">{d.document}</p>
                      </td>
                      {columnas.map(c => {
                        const e = d.evaluaciones.find(x => x.desc === c)
                        const v = e?.val ?? null
                        const bajo = v != null && acta.course.passing != null && v < acta.course.passing
                        return (
                          <td key={c} className={`px-2 py-1.5 text-center text-xs ${v == null ? 'text-gray-300' : bajo ? 'text-rose-700 font-semibold bg-rose-50/60' : 'text-gray-700'}`}>
                            {v ?? '—'}
                          </td>
                        )
                      })}
                      <td className={`px-3 py-1.5 text-right text-xs font-semibold ${d.final_grade != null && acta.course.passing != null && Number(d.retake_grade ?? d.final_grade) < acta.course.passing ? 'text-rose-700' : 'text-gray-800'}`}>
                        {d.retake_grade ?? d.final_grade ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detTerm.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Sin detalle de evaluaciones para este término.</p>}
            </div>
          ) : (
          /* Acta */
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  <th className="w-6"></th>
                  <th className="text-left px-4 py-3 w-full">Estudiante</th>
                  <th className="text-left px-3 py-3">Documento</th>
                  <th className="text-left px-3 py-3">Término</th>
                  <th className="text-right px-3 py-3">Final</th>
                  <th className="text-right px-3 py-3">Recup.</th>
                  <th className="text-right px-3 py-3">Efectiva</th>
                  <th className="text-left px-3 py-3">Estado</th>
                  <th className="text-left px-3 py-3">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibles.map((r, i) => {
                  const key = `${r.document}|${r.term_year}|${r.term_block}`
                  const det = expandido === key ? detalleDe(r) : null
                  return [
                    <tr key={i} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => toggleExpand(r)}>
                      <td className="pl-3 text-gray-300">{expandido === key ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                      <td className="px-4 py-2 text-gray-800">{r.student_name}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.document}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{r.term_year ?? '—'} · {r.term_block ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{r.final_grade ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{r.retake_grade ?? '—'}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${r.estado === 'aprobado' ? 'text-green-700' : r.estado === 'desaprobado' ? 'text-rose-700' : 'text-gray-400'}`}>{r.efectiva ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.estado === 'aprobado' && <span className="text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Aprobado</span>}
                        {r.estado === 'desaprobado' && <span className="text-[11px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">Desaprobado</span>}
                        {r.estado === 'en_curso' && <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">En curso</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                        {SOURCE[r.source ?? ''] ?? r.source ?? '—'}
                        {r.edited && <span className="ml-1 text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">editada</span>}
                        {r.locked && <span className="ml-1 text-[10px]" title="Acta cerrada">🔒</span>}
                      </td>
                    </tr>,
                    expandido === key ? (
                      <tr key={i + '-det'} className="bg-gray-50/60">
                        <td></td>
                        <td colSpan={8} className="px-4 py-3">
                          {loadingDet ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : det && det.evaluaciones.length ? (
                            <table className="text-xs">
                              <thead><tr className="text-[10px] text-gray-400 uppercase"><th className="text-left pr-4 py-0.5">Evaluación</th><th className="text-right pr-4">Peso</th><th className="text-right">Nota</th></tr></thead>
                              <tbody>
                                {det.evaluaciones.map((e, j) => (
                                  <tr key={j}>
                                    <td className="pr-4 py-0.5 text-gray-700">{e.desc}</td>
                                    <td className="pr-4 text-right text-gray-400">{e.pct != null ? `${e.pct}%` : '—'}</td>
                                    <td className={`text-right font-medium ${e.val == null ? 'text-gray-300' : acta.course.passing != null && e.val < acta.course.passing ? 'text-rose-700' : 'text-gray-800'}`}>{e.val ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : <p className="text-xs text-gray-400">Sin detalle de evaluaciones para este registro.</p>}
                        </td>
                      </tr>
                    ) : null,
                  ]
                })}
              </tbody>
            </table>
            {visibles.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Sin registros para este filtro.</p>}
          </div>
          )}

          <p className="text-[11px] text-gray-400">
            <b>Efectiva</b> = recuperación si existe, si no la final. El acta incluye solo estudiantes matriculados en el programa de la asignatura; las convalidaciones aparecen con su origen.
          </p>
        </>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
