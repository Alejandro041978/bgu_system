'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, Plus, Trash2, UserCheck, AlertCircle, CheckCircle2, Loader2, X, Pencil, Check, CalendarDays } from 'lucide-react'

type Employee = { id: string; full_name: string; position: string | null }
type Course = { id: string; name: string; code: string | null; credits: number; level: number | null; program_id: string; program: { id: string; name: string; code: string | null; category_id?: string | null } }
type Assignment = { id: string; hours_per_week: number | null; employee: Employee }
type Offering = { id: string; course: Course; assignments: Assignment[]; start_date: string | null; end_date: string | null; group_label: string | null; semester_id: string }
type Semester = { id: string; name: string; status: string; academic_year_id: string; start_date: string | null; end_date: string | null }
type Category = { id: string; name: string }
type Year = { id: string; name: string; semesters: Semester[] }
type ProgramCourse = { id: string; name: string; code: string | null; credits: number; level: number | null; program_id: string; program: { name: string } }

function fmtDate(d: string | null) {
  if (!d) return ''
  const [y, m, day] = d.split('T')[0].split('-')
  return `${day}/${m}/${y}`
}

export function OfferManager({
  years, faculty, allCourses, contractMap = {}, categories = [],
}: {
  years: Year[]
  faculty: Employee[]
  allCourses: ProgramCourse[]
  contractMap?: Record<string, string[]>
  categories?: Category[]
}) {
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros de vista (todos con opción "todos")
  const [fCategory, setFCategory] = useState('')
  const [fProgram, setFProgram] = useState('')
  const [fGroup, setFGroup] = useState('')
  const [fYear, setFYear] = useState('')
  const [fSemester, setFSemester] = useState('')

  // Panel agregar curso
  const [showAddCourse, setShowAddCourse] = useState(false)
  const [addYearId, setAddYearId] = useState(years[0]?.id ?? '')
  const [addSemesterId, setAddSemesterId] = useState('')
  const [addProgramId, setAddProgramId] = useState('')
  const [addingCourseId, setAddingCourseId] = useState('')
  const [addStartDate, setAddStartDate] = useState('')
  const [addEndDate, setAddEndDate] = useState('')
  const [addGroupLabel, setAddGroupLabel] = useState('')
  const [savingCourse, setSavingCourse] = useState(false)
  const [addCourseError, setAddCourseError] = useState('')

  // Panel asignar docente
  const [assigningOffering, setAssigningOffering] = useState<string | null>(null)
  const [assignEmployeeId, setAssignEmployeeId] = useState('')
  const [assignHours, setAssignHours] = useState('')
  const [savingAssign, setSavingAssign] = useState(false)

  // Edición de fechas / grupo de una oferta ya creada
  const [editingDatesId, setEditingDatesId] = useState<string | null>(null)
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editDatesError, setEditDatesError] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGroupLabel, setEditGroupLabel] = useState('')

  // Cargar TODAS las ofertas una vez
  useEffect(() => {
    fetch('/api/academic/offerings')
      .then(r => r.json())
      .then(data => { setOfferings(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Metadatos de semestre → año (desde la prop years)
  const semMeta: Record<string, { name: string; yearId: string; yearName: string; start_date: string | null; end_date: string | null }> = {}
  for (const y of years) for (const s of y.semesters) semMeta[s.id] = { name: s.name, yearId: y.id, yearName: y.name, start_date: s.start_date, end_date: s.end_date }

  // Opciones de programa (según categoría) presentes en las ofertas
  const programsInOfferings = Array.from(
    new Map(offerings.map(o => [o.course.program_id, o.course.program])).entries()
  ).map(([id, p]) => ({ id, name: p.name, category_id: p.category_id ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const programsForFilter = fCategory ? programsInOfferings.filter(p => p.category_id === fCategory) : programsInOfferings

  // Grupos únicos
  const groupsInOfferings = Array.from(new Set(offerings.map(o => o.group_label).filter((g): g is string => !!g))).sort()

  // Semestres del año filtrado (o todos)
  const semestersForFilter = fYear ? (years.find(y => y.id === fYear)?.semesters ?? []) : years.flatMap(y => y.semesters)

  // Ofertas filtradas por los 5 criterios, ordenadas por fecha de inicio (las sin fecha al final)
  const filteredOfferings = offerings.filter(o => {
    if (fCategory && o.course.program.category_id !== fCategory) return false
    if (fProgram && o.course.program_id !== fProgram) return false
    if (fGroup && (o.group_label ?? '') !== fGroup) return false
    if (fYear && semMeta[o.semester_id]?.yearId !== fYear) return false
    if (fSemester && o.semester_id !== fSemester) return false
    return true
  }).sort((a, b) => {
    if (!a.start_date && !b.start_date) return 0
    if (!a.start_date) return 1
    if (!b.start_date) return -1
    return a.start_date.localeCompare(b.start_date)
  })

  const covered = filteredOfferings.filter(o => o.assignments.length > 0).length
  const total = filteredOfferings.length

  // Asignaturas disponibles para el panel agregar (todas, filtradas por programa)
  const programsInAvailable = Array.from(
    new Map(allCourses.map(c => [c.program_id, c.program])).entries()
  ).map(([id, p]) => ({ id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name))
  const filteredCourses = addProgramId ? allCourses.filter(c => c.program_id === addProgramId) : allCourses
  const addSem = addSemesterId ? semMeta[addSemesterId] : null
  const addYearSemesters = years.find(y => y.id === addYearId)?.semesters ?? []

  async function addCourse() {
    if (!addingCourseId || !addSemesterId) return
    setSavingCourse(true)
    setAddCourseError('')
    const res = await fetch('/api/academic/offerings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semester_id: addSemesterId, course_id: addingCourseId, start_date: addStartDate || null, end_date: addEndDate || null, group_label: addGroupLabel || null }),
    })
    const data = await res.json()
    if (res.ok) {
      setOfferings(prev => [...prev, data])
      setAddingCourseId(''); setAddStartDate(''); setAddEndDate(''); setAddGroupLabel(''); setShowAddCourse(false)
    } else {
      setAddCourseError(data.error ?? 'Error al agregar la asignatura')
    }
    setSavingCourse(false)
  }

  function startEditDates(offering: Offering) {
    setEditingDatesId(offering.id)
    setEditStartDate(offering.start_date ?? '')
    setEditEndDate(offering.end_date ?? '')
    setEditDatesError('')
  }

  async function saveOfferingDates(id: string) {
    setEditDatesError('')
    const res = await fetch(`/api/academic/offerings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date: editStartDate || null, end_date: editEndDate || null }),
    })
    const data = await res.json()
    if (res.ok) { setOfferings(prev => prev.map(o => o.id === id ? data : o)); setEditingDatesId(null) }
    else setEditDatesError(data.error ?? 'Error al guardar las fechas')
  }

  async function removeOffering(id: string) {
    if (!confirm('¿Quitar esta asignatura de la oferta?')) return
    await fetch(`/api/academic/offerings/${id}`, { method: 'DELETE' })
    setOfferings(prev => prev.filter(o => o.id !== id))
  }

  function startEditGroup(offering: Offering) {
    setEditingGroupId(offering.id)
    setEditGroupLabel(offering.group_label ?? '')
  }

  async function saveOfferingGroup(offering: Offering) {
    const res = await fetch(`/api/academic/offerings/${offering.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date: offering.start_date || null, end_date: offering.end_date || null, group_label: editGroupLabel || null }),
    })
    const data = await res.json()
    if (res.ok) { setOfferings(prev => prev.map(o => o.id === offering.id ? data : o)); setEditingGroupId(null) }
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
      setOfferings(prev => prev.map(o => o.id === offeringId ? { ...o, assignments: [...o.assignments, data] } : o))
      setAssigningOffering(null); setAssignEmployeeId(''); setAssignHours('')
    }
    setSavingAssign(false)
  }

  async function removeAssignment(assignmentId: string, offeringId: string) {
    await fetch(`/api/academic/assignments/${assignmentId}`, { method: 'DELETE' })
    setOfferings(prev => prev.map(o => o.id === offeringId ? { ...o, assignments: o.assignments.filter(a => a.id !== assignmentId) } : o))
  }

  const selCls = 'appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Oferta Académica</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestiona los cursos y docentes asignados</p>
      </div>

      {/* Filtros: Categoría · Programa · Grupo · Año · Semestre */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <select value={fCategory} onChange={e => { setFCategory(e.target.value); setFProgram('') }} className={selCls}>
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={fProgram} onChange={e => setFProgram(e.target.value)} className={selCls}>
            <option value="">Todos los programas</option>
            {programsForFilter.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={fGroup} onChange={e => setFGroup(e.target.value)} className={selCls}>
            <option value="">Todos los grupos</option>
            {groupsInOfferings.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={fYear} onChange={e => { setFYear(e.target.value); setFSemester('') }} className={selCls}>
            <option value="">Todos los años</option>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={fSemester} onChange={e => setFSemester(e.target.value)} className={selCls}>
            <option value="">Todos los semestres</option>
            {semestersForFilter.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
          <button onClick={() => { setShowAddCourse(true); setAddProgramId(''); setAddingCourseId(''); if (!addSemesterId) setAddSemesterId(addYearSemesters[0]?.id ?? '') }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Agregar curso
          </button>
        </div>
      </div>

      {/* Panel agregar curso */}
      {showAddCourse && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          {addCourseError && <p className="text-xs text-red-600">{addCourseError}</p>}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Año académico</label>
              <select value={addYearId} onChange={e => { setAddYearId(e.target.value); setAddSemesterId(years.find(y => y.id === e.target.value)?.semesters[0]?.id ?? '') }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Semestre</label>
              <select value={addSemesterId} onChange={e => setAddSemesterId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {addYearSemesters.length === 0 ? <option value="">Sin semestres</option> : addYearSemesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="w-56">
              <label className="block text-xs font-medium text-gray-700 mb-1">Programa</label>
              <select value={addProgramId} onChange={e => { setAddProgramId(e.target.value); setAddingCourseId('') }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Todos los programas —</option>
                {programsInAvailable.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Asignatura</label>
              <select value={addingCourseId} onChange={e => setAddingCourseId(e.target.value)} disabled={filteredCourses.length === 0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                <option value="">— Seleccionar asignatura —</option>
                {filteredCourses.map(c => (
                  <option key={c.id} value={c.id}>
                    {!addProgramId && `${c.program.name} › `}{c.name}{c.code ? ` (${c.code})` : ''} — {c.credits} cr{c.level ? ` · Ciclo ${c.level}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha inicio</label>
              <input type="date" value={addStartDate} onChange={e => setAddStartDate(e.target.value)}
                min={addSem?.start_date ?? undefined} max={addSem?.end_date ?? undefined}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha término</label>
              <input type="date" value={addEndDate} onChange={e => setAddEndDate(e.target.value)}
                min={addSem?.start_date ?? undefined} max={addSem?.end_date ?? undefined}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Grupo <span className="text-gray-400">(opcional)</span></label>
              <input type="text" value={addGroupLabel} onChange={e => setAddGroupLabel(e.target.value)}
                placeholder="Ej: Grupo A…" list="offer-group-suggestions"
                className="w-36 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <datalist id="offer-group-suggestions">{groupsInOfferings.map(g => <option key={g} value={g} />)}</datalist>
            </div>
            <button onClick={addCourse} disabled={!addingCourseId || !addSemesterId || savingCourse}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-lg">
              {savingCourse ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {savingCourse ? 'Agregando...' : 'Agregar'}
            </button>
            <button onClick={() => setShowAddCourse(false)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-white">Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabla de oferta */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : offerings.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          Sin asignaturas en la oferta. Agrega cursos usando el botón de arriba.
        </div>
      ) : filteredOfferings.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          Sin asignaturas para los filtros seleccionados.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Asignatura</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Período</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Ciclo</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Cr.</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Fechas</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Docente asignado</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredOfferings.map(offering => {
                const isAssigning = assigningOffering === offering.id
                const meta = semMeta[offering.semester_id]
                return (
                  <>
                    <tr key={offering.id} className="group hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-800">{offering.course.name}</p>
                        <p className="text-xs text-gray-400">{offering.course.code}{offering.course.program?.name ? ` · ${offering.course.program.name}` : ''}</p>
                        {editingGroupId === offering.id ? (
                          <div className="flex items-center gap-1 mt-1">
                            <input value={editGroupLabel} onChange={e => setEditGroupLabel(e.target.value)}
                              autoFocus placeholder="Grupo" list="offer-group-suggestions"
                              onKeyDown={e => { if (e.key === 'Enter') saveOfferingGroup(offering); if (e.key === 'Escape') setEditingGroupId(null) }}
                              className="w-28 border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <button onClick={() => saveOfferingGroup(offering)} className="text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingGroupId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : offering.group_label ? (
                          <button onClick={() => startEditGroup(offering)} className="mt-1 text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full hover:bg-indigo-100">{offering.group_label}</button>
                        ) : (
                          <button onClick={() => startEditGroup(offering)} className="mt-1 flex items-center gap-1 text-xs text-gray-300 hover:text-indigo-600"><Pencil className="w-3 h-3" /> Grupo</button>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        {meta ? <>{meta.yearName}<br /><span className="text-gray-400">{meta.name}</span></> : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-500 text-xs">{offering.course.level ?? '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{offering.course.credits}</span>
                      </td>
                      <td className="px-3 py-3">
                        {offering.start_date || offering.end_date ? (
                          <button onClick={() => startEditDates(offering)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600">
                            <CalendarDays className="w-3 h-3" />{fmtDate(offering.start_date)} — {fmtDate(offering.end_date)}
                          </button>
                        ) : (
                          <button onClick={() => startEditDates(offering)} className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-blue-600">
                            <Pencil className="w-3 h-3" /> Asignar fechas
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {offering.assignments.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {offering.assignments.map(a => (
                              <span key={a.id} className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                                <UserCheck className="w-3 h-3" />{a.employee.full_name}
                                {a.hours_per_week ? <span className="text-indigo-400">· {a.hours_per_week}h</span> : null}
                                <button onClick={() => removeAssignment(a.id, offering.id)} className="ml-0.5 hover:text-red-500"><X className="w-3 h-3" /></button>
                              </span>
                            ))}
                            <button onClick={() => { setAssigningOffering(offering.id); setAssignEmployeeId(''); setAssignHours('') }} className="text-xs text-indigo-400 hover:text-indigo-600 px-1"><Plus className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <button onClick={() => { setAssigningOffering(offering.id); setAssignEmployeeId(''); setAssignHours('') }}
                            className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors">
                            <AlertCircle className="w-3.5 h-3.5" /> Sin docente — Asignar
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => removeOffering(offering.id)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                    {editingDatesId === offering.id && (
                      <tr key={`dates-${offering.id}`} className="bg-blue-50">
                        <td colSpan={7} className="px-5 py-3">
                          {editDatesError && <p className="text-xs text-red-600 mb-2">{editDatesError}</p>}
                          <div className="flex items-center gap-3">
                            <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)}
                              min={meta?.start_date ?? undefined} max={meta?.end_date ?? undefined}
                              className="border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <span className="text-xs text-gray-400">—</span>
                            <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)}
                              min={meta?.start_date ?? undefined} max={meta?.end_date ?? undefined}
                              className="border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <button onClick={() => saveOfferingDates(offering.id)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-sm font-medium rounded-lg">
                              <Check className="w-3.5 h-3.5" /> Guardar
                            </button>
                            <button onClick={() => setEditingDatesId(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg"><X className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isAssigning && (
                      <tr key={`assign-${offering.id}`} className="bg-indigo-50">
                        <td colSpan={7} className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <select value={assignEmployeeId} onChange={e => setAssignEmployeeId(e.target.value)}
                              className="flex-1 border border-indigo-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                              <option value="">— Seleccionar docente —</option>
                              {faculty.map(f => {
                                const alreadyAssigned = offering.assignments.some(a => a.employee.id === f.id)
                                const hasContract = contractMap[meta?.yearId ?? '']?.includes(f.id) ?? false
                                const disabled = alreadyAssigned || !hasContract
                                return (
                                  <option key={f.id} value={f.id} disabled={disabled}>
                                    {f.full_name}{f.position ? ` — ${f.position}` : ''}
                                    {alreadyAssigned ? ' (ya asignado)' : !hasContract ? ' (sin contrato)' : ''}
                                  </option>
                                )
                              })}
                            </select>
                            <input type="number" min="1" max="40" value={assignHours} onChange={e => setAssignHours(e.target.value)}
                              placeholder="Horas/sem" className="w-28 border border-indigo-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            <button onClick={() => assignFaculty(offering.id)} disabled={!assignEmployeeId || savingAssign}
                              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 text-sm font-medium rounded-lg">
                              {savingAssign ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                              {savingAssign ? 'Asignando...' : 'Confirmar'}
                            </button>
                            <button onClick={() => setAssigningOffering(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg"><X className="w-4 h-4" /></button>
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
