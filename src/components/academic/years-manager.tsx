'use client'

import { useState } from 'react'
import { Plus, ChevronDown, ChevronRight, Trash2, Calendar, Circle, Pencil, Check, X } from 'lucide-react'

type Semester = { id: string; name: string; start_date: string | null; end_date: string | null; status: string }
type Year = { id: string; name: string; start_date: string | null; end_date: string | null; status: string; semesters: Semester[] }

const SEM_STATUS: Record<string, { label: string; color: string }> = {
  planning: { label: 'Planificación', color: 'bg-gray-100 text-gray-600' },
  active:   { label: 'Activo',        color: 'bg-green-100 text-green-700' },
  closed:   { label: 'Cerrado',       color: 'bg-blue-100 text-blue-700' },
}

function fmtDate(d: string | null) {
  if (!d) return ''
  const [y, m, day] = d.split('T')[0].split('-')
  return `${day}/${m}/${y}`
}

export function YearsManager({ initial }: { initial: Year[] }) {
  const [years, setYears] = useState(initial)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // New year form
  const [showYearForm, setShowYearForm] = useState(false)
  const [yearForm, setYearForm] = useState({ name: '', start_date: '', end_date: '' })
  const [savingYear, setSavingYear] = useState(false)

  // New semester form per year
  const [semForm, setSemForm] = useState<Record<string, { name: string; start_date: string; end_date: string; status: string }>>({})
  const [showSemForm, setShowSemForm] = useState<Record<string, boolean>>({})
  const [savingSem, setSavingSem] = useState<Record<string, boolean>>({})

  // Edit semester inline
  const [editingSemId, setEditingSemId] = useState<string | null>(null)
  const [editSemForm, setEditSemForm] = useState({ name: '', start_date: '', end_date: '' })
  const [savingSemEdit, setSavingSemEdit] = useState(false)

  async function createYear() {
    setSavingYear(true)
    const res = await fetch('/api/academic/years', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yearForm),
    })
    const data = await res.json()
    if (res.ok) {
      setYears(prev => [{ ...data, semesters: [] }, ...prev])
      setYearForm({ name: '', start_date: '', end_date: '' })
      setShowYearForm(false)
    }
    setSavingYear(false)
  }

  async function deleteYear(id: string) {
    if (!confirm('¿Eliminar este año académico y todos sus semestres?')) return
    await fetch(`/api/academic/years/${id}`, { method: 'DELETE' })
    setYears(prev => prev.filter(y => y.id !== id))
  }

  async function createSemester(yearId: string) {
    setSavingSem(prev => ({ ...prev, [yearId]: true }))
    const form = semForm[yearId] ?? { name: '', start_date: '', end_date: '', status: 'planning' }
    const res = await fetch('/api/academic/semesters', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, academic_year_id: yearId }),
    })
    const data = await res.json()
    if (res.ok) {
      setYears(prev => prev.map(y => y.id === yearId ? { ...y, semesters: [...y.semesters, data] } : y))
      setSemForm(prev => ({ ...prev, [yearId]: { name: '', start_date: '', end_date: '', status: 'planning' } }))
      setShowSemForm(prev => ({ ...prev, [yearId]: false }))
    }
    setSavingSem(prev => ({ ...prev, [yearId]: false }))
  }

  async function updateSemesterStatus(semId: string, yearId: string, status: string) {
    await fetch(`/api/academic/semesters/${semId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    setYears(prev => prev.map(y => y.id === yearId
      ? { ...y, semesters: y.semesters.map(s => s.id === semId ? { ...s, status } : s) }
      : y
    ))
  }

  function startEditSemester(sem: Semester) {
    setEditingSemId(sem.id)
    setEditSemForm({
      name: sem.name,
      start_date: sem.start_date ? sem.start_date.split('T')[0] : '',
      end_date: sem.end_date ? sem.end_date.split('T')[0] : '',
    })
  }

  async function saveSemesterEdit(semId: string, yearId: string) {
    setSavingSemEdit(true)
    const res = await fetch(`/api/academic/semesters/${semId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editSemForm.name,
        start_date: editSemForm.start_date || null,
        end_date: editSemForm.end_date || null,
      }),
    })
    if (res.ok) {
      setYears(prev => prev.map(y => y.id === yearId
        ? { ...y, semesters: y.semesters.map(s => s.id === semId
            ? { ...s, name: editSemForm.name, start_date: editSemForm.start_date || null, end_date: editSemForm.end_date || null }
            : s) }
        : y
      ))
      setEditingSemId(null)
    }
    setSavingSemEdit(false)
  }

  async function deleteSemester(semId: string, yearId: string) {
    if (!confirm('¿Eliminar este semestre y toda su oferta académica?')) return
    await fetch(`/api/academic/semesters/${semId}`, { method: 'DELETE' })
    setYears(prev => prev.map(y => y.id === yearId
      ? { ...y, semesters: y.semesters.filter(s => s.id !== semId) }
      : y
    ))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Años y Semestres Académicos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestiona la estructura del calendario académico</p>
        </div>
        <button onClick={() => setShowYearForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Nuevo año académico
        </button>
      </div>

      {/* Formulario nuevo año */}
      {showYearForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-800">Nuevo año académico</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
              <input value={yearForm.name} onChange={e => setYearForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej. 2025 o 2025-2026"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha inicio</label>
              <input type="date" value={yearForm.start_date} onChange={e => setYearForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha fin</label>
              <input type="date" value={yearForm.end_date} onChange={e => setYearForm(p => ({ ...p, end_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createYear} disabled={!yearForm.name || savingYear}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors">
              {savingYear ? 'Guardando...' : 'Crear año académico'}
            </button>
            <button onClick={() => setShowYearForm(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de años */}
      {years.length === 0 && !showYearForm && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No hay años académicos registrados.</p>
        </div>
      )}

      {years.map(year => {
        const isOpen = expanded[year.id] ?? true
        return (
          <div key={year.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header del año */}
            <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpanded(p => ({ ...p, [year.id]: !isOpen }))}>
              {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">{year.name}</p>
                {(year.start_date || year.end_date) && (
                  <p className="text-xs text-gray-400">{fmtDate(year.start_date)} — {fmtDate(year.end_date)}</p>
                )}
              </div>
              <span className="text-xs text-gray-400">{year.semesters.length} semestres</span>
              <button onClick={e => { e.stopPropagation(); deleteYear(year.id) }}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-3 space-y-2">
                {/* Semestres */}
                {year.semesters.length === 0 && !showSemForm[year.id] && (
                  <p className="text-xs text-gray-400 py-2">No hay semestres. Agrega el primero.</p>
                )}
                {year.semesters.map(sem => editingSemId === sem.id ? (
                  <div key={sem.id} className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={editSemForm.name}
                        onChange={e => setEditSemForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Nombre del semestre"
                        className="col-span-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="date"
                        value={editSemForm.start_date}
                        onChange={e => setEditSemForm(p => ({ ...p, start_date: e.target.value }))}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="date"
                        value={editSemForm.end_date}
                        onChange={e => setEditSemForm(p => ({ ...p, end_date: e.target.value }))}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveSemesterEdit(sem.id, year.id)} disabled={!editSemForm.name || savingSemEdit}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium rounded-lg transition-colors">
                        <Check className="w-3.5 h-3.5" /> {savingSemEdit ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button onClick={() => setEditingSemId(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-white transition-colors">
                        <X className="w-3.5 h-3.5" /> Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={sem.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-50 group">
                    <Circle className="w-2 h-2 text-gray-300 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{sem.name}</p>
                      {(sem.start_date || sem.end_date) && (
                        <p className="text-xs text-gray-400">{fmtDate(sem.start_date)} — {fmtDate(sem.end_date)}</p>
                      )}
                    </div>
                    <select
                      value={sem.status}
                      onChange={e => updateSemesterStatus(sem.id, year.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${SEM_STATUS[sem.status]?.color ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      <option value="planning">Planificación</option>
                      <option value="active">Activo</option>
                      <option value="closed">Cerrado</option>
                    </select>
                    <button onClick={() => startEditSemester(sem)}
                      className="p-1 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteSemester(sem.id, year.id)}
                      className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Form nuevo semestre */}
                {showSemForm[year.id] ? (
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2 mt-2">
                    <p className="text-xs font-semibold text-gray-700">Nuevo semestre</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={semForm[year.id]?.name ?? ''}
                        onChange={e => setSemForm(p => ({ ...p, [year.id]: { ...p[year.id], name: e.target.value } }))}
                        placeholder="Ej. 2025-I"
                        className="col-span-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="date"
                        value={semForm[year.id]?.start_date ?? ''}
                        onChange={e => setSemForm(p => ({ ...p, [year.id]: { ...p[year.id], start_date: e.target.value } }))}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="date"
                        value={semForm[year.id]?.end_date ?? ''}
                        onChange={e => setSemForm(p => ({ ...p, [year.id]: { ...p[year.id], end_date: e.target.value } }))}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => createSemester(year.id)}
                        disabled={!semForm[year.id]?.name || savingSem[year.id]}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium rounded-lg transition-colors">
                        {savingSem[year.id] ? 'Guardando...' : 'Crear semestre'}
                      </button>
                      <button onClick={() => setShowSemForm(p => ({ ...p, [year.id]: false }))}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowSemForm(p => ({ ...p, [year.id]: true }))}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 py-1 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Agregar semestre
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
