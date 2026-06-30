'use client'

import { useState } from 'react'
import { Plus, Trash2, BookOpen, ChevronRight, Pencil, Check, X } from 'lucide-react'

type Course = { id: string; name: string; code: string | null; credits: number; level: number | null }
type Program = { id: string; name: string; code: string | null; description: string | null; courses: Course[] }

export function ProgramsManager({ initial }: { initial: Program[] }) {
  const [programs, setPrograms] = useState(initial)
  const [selected, setSelected] = useState<string | null>(initial[0]?.id ?? null)

  // Program form
  const [showProgramForm, setShowProgramForm] = useState(false)
  const [programForm, setProgramForm] = useState({ name: '', code: '', description: '' })
  const [savingProgram, setSavingProgram] = useState(false)

  // Course form
  const [showCourseForm, setShowCourseForm] = useState(false)
  const [courseForm, setCourseForm] = useState({ name: '', code: '', credits: '3', level: '' })
  const [savingCourse, setSavingCourse] = useState(false)

  // Edit course inline
  const [editingCourse, setEditingCourse] = useState<string | null>(null)
  const [editCourseForm, setEditCourseForm] = useState<Partial<Course>>({})

  // Edit program inline
  const [editingProgram, setEditingProgram] = useState<string | null>(null)
  const [editProgramForm, setEditProgramForm] = useState({ name: '', code: '' })

  const selectedProgram = programs.find(p => p.id === selected)

  // Group courses by level
  const coursesByLevel = selectedProgram?.courses.reduce((acc, c) => {
    const key = c.level ?? 0
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {} as Record<number, Course[]>) ?? {}
  const levels = Object.keys(coursesByLevel).map(Number).sort((a, b) => a - b)

  async function createProgram() {
    setSavingProgram(true)
    const res = await fetch('/api/academic/programs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(programForm),
    })
    const data = await res.json()
    if (res.ok) {
      setPrograms(prev => [...prev, { ...data, courses: [] }])
      setSelected(data.id)
      setProgramForm({ name: '', code: '', description: '' })
      setShowProgramForm(false)
    }
    setSavingProgram(false)
  }

  async function deleteProgram(id: string) {
    if (!confirm('¿Eliminar este programa?')) return
    const res = await fetch(`/api/academic/programs/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? 'No se pudo eliminar el programa')
      return
    }
    setPrograms(prev => prev.filter(p => p.id !== id))
    if (selected === id) setSelected(programs.find(p => p.id !== id)?.id ?? null)
  }

  function startEditProgram(p: Program) {
    setEditingProgram(p.id)
    setEditProgramForm({ name: p.name, code: p.code ?? '' })
  }

  async function saveProgramEdit(id: string) {
    await fetch(`/api/academic/programs/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editProgramForm.name, code: editProgramForm.code || null }),
    })
    setPrograms(prev => prev.map(p => p.id === id ? { ...p, name: editProgramForm.name, code: editProgramForm.code || null } : p))
    setEditingProgram(null)
  }

  async function createCourse() {
    if (!selected) return
    setSavingCourse(true)
    const res = await fetch('/api/academic/courses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...courseForm, program_id: selected, credits: parseInt(courseForm.credits) || 3, level: courseForm.level ? parseInt(courseForm.level) : null }),
    })
    const data = await res.json()
    if (res.ok) {
      setPrograms(prev => prev.map(p => p.id === selected ? { ...p, courses: [...p.courses, data] } : p))
      setCourseForm({ name: '', code: '', credits: '3', level: '' })
      setShowCourseForm(false)
    }
    setSavingCourse(false)
  }

  async function saveCourseEdit(courseId: string) {
    await fetch(`/api/academic/courses/${courseId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editCourseForm, credits: Number(editCourseForm.credits), level: editCourseForm.level ? Number(editCourseForm.level) : null }),
    })
    setPrograms(prev => prev.map(p => p.id === selected
      ? { ...p, courses: p.courses.map(c => c.id === courseId ? { ...c, ...editCourseForm, credits: Number(editCourseForm.credits), level: editCourseForm.level ? Number(editCourseForm.level) : null } : c) }
      : p
    ))
    setEditingCourse(null)
  }

  async function deleteCourse(courseId: string) {
    if (!confirm('¿Eliminar esta asignatura?')) return
    await fetch(`/api/academic/courses/${courseId}`, { method: 'DELETE' })
    setPrograms(prev => prev.map(p => p.id === selected
      ? { ...p, courses: p.courses.filter(c => c.id !== courseId) }
      : p
    ))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Programas Académicos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define programas y sus asignaturas por ciclo/nivel</p>
        </div>
        <button onClick={() => setShowProgramForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Nuevo programa
        </button>
      </div>

      {showProgramForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-800">Nuevo programa académico</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
              <input value={programForm.name} onChange={e => setProgramForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej. Ingeniería de Sistemas"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Código</label>
              <input value={programForm.code} onChange={e => setProgramForm(p => ({ ...p, code: e.target.value }))}
                placeholder="Ej. IS-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
              <input value={programForm.description} onChange={e => setProgramForm(p => ({ ...p, description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createProgram} disabled={!programForm.name || savingProgram}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-lg">
              {savingProgram ? 'Guardando...' : 'Crear programa'}
            </button>
            <button onClick={() => setShowProgramForm(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}

      <div className="flex gap-4 min-h-[500px]">
        {/* Lista de programas */}
        <div className="w-64 flex-shrink-0 space-y-1">
          {programs.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 py-10 text-center">
              <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Sin programas</p>
            </div>
          )}
          {programs.map(p => editingProgram === p.id ? (
            <div key={p.id} className="w-full px-3 py-3 rounded-xl border border-blue-200 bg-blue-50 space-y-2">
              <input value={editProgramForm.name} onChange={e => setEditProgramForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={editProgramForm.code} onChange={e => setEditProgramForm(f => ({ ...f, code: e.target.value }))}
                placeholder="Código" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <button onClick={() => saveProgramEdit(p.id)} disabled={!editProgramForm.name}
                  className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2.5 py-1 text-xs font-medium rounded-lg"><Check className="w-3.5 h-3.5" /> Guardar</button>
                <button onClick={() => setEditingProgram(null)} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-white"><X className="w-3.5 h-3.5" /> Cancelar</button>
              </div>
            </div>
          ) : (
            <button key={p.id} onClick={() => setSelected(p.id)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors group ${selected === p.id ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}>
              <div className="flex items-center gap-2">
                <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${selected === p.id ? 'rotate-90 text-blue-500' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  {p.code && <p className="text-xs text-gray-400">{p.code}</p>}
                  <p className="text-xs text-gray-400">{p.courses.length} asignaturas</p>
                </div>
                <button onClick={e => { e.stopPropagation(); startEditProgram(p) }}
                  className="p-1 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {p.courses.length === 0 && (
                  <button onClick={e => { e.stopPropagation(); deleteProgram(p.id) }}
                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Detalle del programa seleccionado */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {!selectedProgram ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              Selecciona un programa
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{selectedProgram.name}</h2>
                  {selectedProgram.code && <p className="text-xs text-gray-400">{selectedProgram.code}</p>}
                </div>
                <button onClick={() => setShowCourseForm(true)}
                  className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Agregar asignatura
                </button>
              </div>

              {/* Form nueva asignatura */}
              {showCourseForm && (
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <input value={courseForm.name} onChange={e => setCourseForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Nombre *" className="col-span-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input value={courseForm.code} onChange={e => setCourseForm(p => ({ ...p, code: e.target.value }))}
                      placeholder="Código" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="number" min="1" value={courseForm.level} onChange={e => setCourseForm(p => ({ ...p, level: e.target.value }))}
                      placeholder="Ciclo" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="number" min="1" max="10" value={courseForm.credits} onChange={e => setCourseForm(p => ({ ...p, credits: e.target.value }))}
                      placeholder="Créditos" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={createCourse} disabled={!courseForm.name || savingCourse}
                      className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium rounded-lg">
                      {savingCourse ? 'Guardando...' : 'Agregar asignatura'}
                    </button>
                    <button onClick={() => setShowCourseForm(false)}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100">Cancelar</button>
                  </div>
                </div>
              )}

              <div className="overflow-auto">
                {levels.length === 0 && !showCourseForm ? (
                  <div className="py-16 text-center text-sm text-gray-400">
                    Sin asignaturas. Agrega la primera.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Asignatura</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Ciclo</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Créditos</th>
                        <th className="w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {levels.map(level => (
                        <>
                          {level > 0 && (
                            <tr key={`h-${level}`}>
                              <td colSpan={4} className="px-5 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/50">
                                Ciclo {level}
                              </td>
                            </tr>
                          )}
                          {coursesByLevel[level].map(course => (
                            <tr key={course.id} className="group hover:bg-gray-50/50">
                              {editingCourse === course.id ? (
                                <>
                                  <td className="px-5 py-2">
                                    <div className="flex gap-2">
                                      <input value={editCourseForm.name ?? ''} onChange={e => setEditCourseForm(p => ({ ...p, name: e.target.value }))}
                                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                      <input value={editCourseForm.code ?? ''} onChange={e => setEditCourseForm(p => ({ ...p, code: e.target.value }))}
                                        placeholder="Código" className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input type="number" value={editCourseForm.level ?? ''} onChange={e => setEditCourseForm(p => ({ ...p, level: e.target.value ? Number(e.target.value) : null }))}
                                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input type="number" value={editCourseForm.credits ?? ''} onChange={e => setEditCourseForm(p => ({ ...p, credits: Number(e.target.value) }))}
                                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => saveCourseEdit(course.id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                                      <button onClick={() => setEditingCourse(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-5 py-2.5">
                                    <p className="font-medium text-gray-800">{course.name}</p>
                                    {course.code && <p className="text-xs text-gray-400">{course.code}</p>}
                                  </td>
                                  <td className="px-3 py-2.5 text-center text-gray-500">{course.level ?? '—'}</td>
                                  <td className="px-3 py-2.5 text-center">
                                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{course.credits} cr</span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => { setEditingCourse(course.id); setEditCourseForm({ name: course.name, code: course.code, credits: course.credits, level: course.level }) }}
                                        className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                                      <button onClick={() => deleteCourse(course.id)}
                                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
