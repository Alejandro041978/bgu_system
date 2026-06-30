'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, Loader2, CalendarDays, UserCheck, AlertCircle } from 'lucide-react'

type Employee = { id: string; full_name: string; position: string | null }
type Assignment = { id: string; hours_per_week: number | null; employee: Employee }
type Course = { id: string; name: string; code: string | null; credits: number; level: number | null }
type Offering = { id: string; start_date: string | null; end_date: string | null; course: Course; assignments: Assignment[] }
type SemesterBlock = { id: string; name: string; start_date: string | null; end_date: string | null; offerings: Offering[] }

type Program = { id: string; name: string; code: string | null }
type Semester = { id: string; name: string }
type Year = { id: string; name: string; semesters: Semester[] }

function fmtDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('T')[0].split('-')
  return `${day}/${m}/${y}`
}

export function SchedulesView({ programs, years }: { programs: Program[]; years: Year[] }) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? '')
  const [yearId, setYearId] = useState(years[0]?.id ?? '')
  const [semesterId, setSemesterId] = useState('')
  const [blocks, setBlocks] = useState<SemesterBlock[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const selectedYear = years.find(y => y.id === yearId)
  const semesters = selectedYear?.semesters ?? []

  useEffect(() => { setSemesterId('') }, [yearId])

  useEffect(() => {
    if (!programId || !yearId) { setBlocks([]); return }
    setLoading(true)
    setSearched(true)
    const params = new URLSearchParams({ program_id: programId, academic_year_id: yearId })
    if (semesterId) params.set('semester_id', semesterId)
    fetch(`/api/academic/schedules?${params.toString()}`)
      .then(r => r.json())
      .then(data => { setBlocks(Array.isArray(data) ? data : []); setLoading(false) })
  }, [programId, yearId, semesterId])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Cronogramas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Asignaturas programadas en la oferta académica, con fechas y docente asignado</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <select value={programId} onChange={e => setProgramId(e.target.value)}
            className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]">
            {programs.length === 0
              ? <option value="">Sin programas</option>
              : programs.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select value={yearId} onChange={e => setYearId(e.target.value)}
            className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {years.length === 0
              ? <option value="">Sin años académicos</option>
              : years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select value={semesterId} onChange={e => setSemesterId(e.target.value)}
            disabled={semesters.length === 0}
            className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
            <option value="">Todos los semestres</option>
            {semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : !programId || !yearId ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          Selecciona un programa y un año académico.
        </div>
      ) : searched && blocks.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          No hay asignaturas de este programa en la oferta del año/semestre seleccionado.
        </div>
      ) : (
        <div className="space-y-4">
          {blocks.map(block => (
            <div key={block.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
                <CalendarDays className="w-4 h-4 text-blue-500" />
                <p className="text-sm font-semibold text-gray-900">{block.name}</p>
                {(block.start_date || block.end_date) && (
                  <span className="text-xs text-gray-400">{fmtDate(block.start_date)} — {fmtDate(block.end_date)}</span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Asignatura</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Ciclo</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Cr.</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">Fechas</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Docente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {block.offerings.map(o => (
                    <tr key={o.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-800">{o.course.name}</p>
                        {o.course.code && <p className="text-xs text-gray-400">{o.course.code}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{o.course.level ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{o.course.credits} cr</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">
                        {o.start_date || o.end_date ? `${fmtDate(o.start_date)} — ${fmtDate(o.end_date)}` : <span className="text-gray-300">Sin definir</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {o.assignments.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {o.assignments.map(a => (
                              <span key={a.id} className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                                <UserCheck className="w-3 h-3" />{a.employee.full_name}
                                {a.hours_per_week ? <span className="text-indigo-400">· {a.hours_per_week}h</span> : null}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-amber-600">
                            <AlertCircle className="w-3.5 h-3.5" /> Sin docente
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
