'use client'

import { useEffect, useState } from 'react'
import { Loader2, BookOpen } from 'lucide-react'

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

  useEffect(() => {
    fetch('/api/academic/course-report').then(r => r.json()).then(d => setPrograms(d.programs ?? []))
  }, [])

  useEffect(() => {
    setCourses([]); setCourseId(''); setActa(null)
    if (!programId) return
    fetch(`/api/academic/course-report?program_id=${programId}`).then(r => r.json()).then(d => setCourses(d.courses ?? []))
  }, [programId])

  useEffect(() => {
    setActa(null); setTerm('todos')
    if (!courseId) return
    setLoading(true)
    fetch(`/api/academic/course-report?course_id=${courseId}`).then(r => r.json()).then(d => {
      if (!d.error) setActa(d)
      setLoading(false)
    })
  }, [courseId])

  const visibles = (acta?.rows ?? []).filter(r =>
    term === 'todos' || `${r.term_year ?? '—'} · ${r.term_block ?? '—'}` === term)

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

          {/* Filtro por término */}
          {acta.terms.length > 1 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              <button onClick={() => setTerm('todos')} className={`px-2.5 py-1 rounded-full border ${term === 'todos' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-600'}`}>Todos los términos</button>
              {acta.terms.map(t => (
                <button key={t} onClick={() => setTerm(t)} className={`px-2.5 py-1 rounded-full border ${term === t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-600'}`}>{t}</button>
              ))}
            </div>
          )}

          {/* Acta */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide whitespace-nowrap">
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
                {visibles.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
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
                  </tr>
                ))}
              </tbody>
            </table>
            {visibles.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Sin registros para este filtro.</p>}
          </div>

          <p className="text-[11px] text-gray-400">
            <b>Efectiva</b> = recuperación si existe, si no la final. El acta incluye solo estudiantes matriculados en el programa de la asignatura; las convalidaciones aparecen con su origen.
          </p>
        </>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
