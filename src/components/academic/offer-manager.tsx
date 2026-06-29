'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, Plus, Trash2, UserCheck, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'

type Employee = { id: string; full_name: string; position: string | null }
type Course = { id: string; name: string; code: string | null; credits: number; level: number | null; program_id: string; program: { id: string; name: string; code: string | null } }
type Assignment = { id: string; hours_per_week: number | null; employee: Employee }
type Offering = { id: string; course: Course; assignments: Assignment[] }
type Semester = { id: string; name: string; status: string; academic_year_id: string }
type Year = { id: string; name: string; semesters: Semester[] }
type ProgramCourse = { id: string; name: string; code: string | null; credits: number; level: number | null; program: { name: string } }

export function OfferManager({
  years, faculty, allCourses,
}: {
  years: Year[]
  faculty: Employee[]
  allCourses: ProgramCourse[]
}) {
  const [selectedYearId, setSelectedYearId] = useState(years[0]?.id ?? '')
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [loading, setLoading] = useState(false)

  // Panel agregar curso
  const [showAddCourse, setShowAddCourse] = useState(false)
  const [addingCourseId, setAddingCourseId] = useState('')
  const [savingCourse, setSavingCourse] = useState(false)

  // Panel asignar docente
  const [assigningOffering, setAssigningOffering] = useState<string | null>(null)
  const [assignEmployeeId, setAssignEmployeeId] = useState('')
  const [assignHours, setAssignHours] = useState('')
  const [savingAssign, setSavingAssign] = useState(false)

  const selectedYear = years.find(y => y.id === selectedYearId)
  const semesters = selectedYear?.semesters ?? []

  // Auto-select first semester when year changes
  useEffect(() => {
    const first = semesters[0]?.id ?? ''
    setSelectedSemesterId(first)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId])

  // Load offerings when semester changes
  useEffect(() => {
    if (!selectedSemesterId) { setOfferings([]); return }
    setLoading(true)
    fetch(`/api/academic/offerings?semester_id=${selectedSemesterId}`)
      .then(r => r.json())
      .then(data => { setOfferings(Array.isArray(data) ? data : []); setLoading(false) })
  }, [selectedSemesterId])

  // Courses not yet in this semester
  const offeredCourseIds = new Set(offerings.map(o => o.course.id))
  const availableCourses = allCourses.filter(c => !offeredCourseIds.has(c.id))

  const covered = offerings.filter(o => o.assignments.length > 0).length
  const total = offerings.length

  async function addCourse() {
    if (!addingCourseId || !selectedSemesterId) return
    setSavingCourse(true)
    const res = await fetch('/api/academic/offerings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semester_id: selectedSemesterId, course_id: addingCourseId }),
    })
    const data = await res.json()
    if (res.ok) {
      setOfferings(prev => [...prev, data])
      setAddingCourseId('')
      setShowAddCourse(false)
    }
    setSavingCourse(false)
  }

  async function removeOffering(id: string) {
    if (!confirm('¿Quitar esta asignatura de la oferta?')) return
    await fetch(`/api/academic/offerings/${id}`, { method: 'DELETE' })
    setOfferings(prev => prev.filter(o => o.id !== id))
  }

  async function assignFaculty(offeringId: string) {
    if (!assignEmployeeId) return
    setSavingAssign(true)
    const res = await fetch('/api/academic/assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offering_id: offeringId, employee_id: assignEmployeeId, hours_per_week: assignHours ? parseInt(assignHours) : null }),
    })
    const data = await res.json()
    if (res.ok) {
      setOfferings(prev => prev.map(o => o.id === offeringId
        ? { ...o, assignments: [...o.assignments, data] }
        : o
      ))
      setAssigningOffering(null)
      setAssignEmployeeId('')
      setAssignHours('')
    }
    setSavingAssign(false)
  }

  async function removeAssignment(assignmentId: string, offeringId: string) {
    await fetch(`/api/academic/assignments/${assignmentId}`, { method: 'DELETE' })
    setOfferings(prev => prev.map(o => o.id === offeringId
      ? { ...o, assignments: o.assignments.filter(a => a.id !== assignmentId) }
      : o
    ))
  }

  // Faculty already assigned to offerings in this semester (for quick lookup)
  const assignedFacultyIds = new Set(offerings.flatMap(o => o.assignments.map(a => a.employee.id)))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Oferta Académica</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestiona los cursos y docentes asignados por semestre</p>
      </div>

      {/* Selector año + semestre */}
      <div className="flex gap-3">
        <div className="relative">
          <select value={selectedYearId} onChange={e => setSelectedYearId(e.target.value)}
            className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={selectedSemesterId} onChange={e => setSelectedSemesterId(e.target.value)}
            disabled={semesters.length === 0}
            className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
            {semesters.length === 0
              ? <option value="">Sin semestres</option>
              : semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {total > 0 && (
            <div className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg ${covered === total ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              {covered === total ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {covered}/{total} asignaturas con docente
            </div>
          )}
          {selectedSemesterId && (
            <button onClick={() => setShowAddCourse(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Agregar curso
            </button>
          )}
        </div>
      </div>

      {/* Panel agregar curso */}
      {showAddCourse && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Asignatura del programa</label>
            <select value={addingCourseId} onChange={e => setAddingCourseId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleccionar asignatura —</option>
              {availableCourses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.program.name} › {c.name}{c.code ? ` (${c.code})` : ''} — {c.credits} cr{c.level ? ` · Ciclo ${c.level}` : ''}
                </option>
              ))}
            </select>
          </div>
          <button onClick={addCourse} disabled={!addingCourseId || savingCourse}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-lg">
            {savingCourse ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {savingCourse ? 'Agregando...' : 'Agregar'}
          </button>
          <button onClick={() => setShowAddCourse(false)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-white">Cancelar</button>
        </div>
      )}

      {/* Tabla de oferta */}
      {!selectedSemesterId ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          Selecciona un año y semestre para ver la oferta académica
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
        </div>
      ) : offerings.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          Sin asignaturas en este semestre. Agrega cursos usando el botón de arriba.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Asignatura</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Programa</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Ciclo</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Cr.</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Docente asignado</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {offerings.map(offering => {
                const isAssigning = assigningOffering === offering.id
                const assigned = offering.assignments[0] ?? null

                return (
                  <>
                    <tr key={offering.id} className="group hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-800">{offering.course.name}</p>
                        {offering.course.code && <p className="text-xs text-gray-400">{offering.course.code}</p>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 truncate max-w-[120px]">
                        {offering.course.program?.name ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-500 text-xs">{offering.course.level ?? '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{offering.course.credits}</span>
                      </td>
                      <td className="px-3 py-3">
                        {offering.assignments.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {offering.assignments.map(a => (
                              <span key={a.id} className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                                <UserCheck className="w-3 h-3" />
                                {a.employee.full_name}
                                {a.hours_per_week ? <span className="text-indigo-400">· {a.hours_per_week}h</span> : null}
                                <button onClick={() => removeAssignment(a.id, offering.id)} className="ml-0.5 hover:text-red-500">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                            <button onClick={() => { setAssigningOffering(offering.id); setAssignEmployeeId(''); setAssignHours('') }}
                              className="text-xs text-indigo-400 hover:text-indigo-600 px-1">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setAssigningOffering(offering.id); setAssignEmployeeId(''); setAssignHours('') }}
                            className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors">
                            <AlertCircle className="w-3.5 h-3.5" /> Sin docente — Asignar
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => removeOffering(offering.id)}
                          className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {isAssigning && (
                      <tr key={`assign-${offering.id}`} className="bg-indigo-50">
                        <td colSpan={6} className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <select value={assignEmployeeId} onChange={e => setAssignEmployeeId(e.target.value)}
                              className="flex-1 border border-indigo-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                              <option value="">— Seleccionar docente —</option>
                              {faculty.map(f => (
                                <option key={f.id} value={f.id}
                                  disabled={offering.assignments.some(a => a.employee.id === f.id)}>
                                  {f.full_name}{f.position ? ` — ${f.position}` : ''}
                                  {offering.assignments.some(a => a.employee.id === f.id) ? ' (ya asignado)' : ''}
                                </option>
                              ))}
                            </select>
                            <input type="number" min="1" max="40" value={assignHours}
                              onChange={e => setAssignHours(e.target.value)}
                              placeholder="Horas/sem" className="w-28 border border-indigo-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            <button onClick={() => assignFaculty(offering.id)} disabled={!assignEmployeeId || savingAssign}
                              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 text-sm font-medium rounded-lg">
                              {savingAssign ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                              {savingAssign ? 'Asignando...' : 'Confirmar'}
                            </button>
                            <button onClick={() => setAssigningOffering(null)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
