'use client'

import { useState, useRef } from 'react'
import { Search, Loader2, User, X } from 'lucide-react'
import { GradesTable, type Grade } from './grades-table'

interface Student { document_number: string; student_name: string }
interface Program { id: string; name: string }

export function GradesExplorer() {
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Student | null>(null)
  const [grades, setGrades] = useState<Grade[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [programFilter, setProgramFilter] = useState<string>('all')
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [editing, setEditing] = useState<Grade | null>(null)
  const [saving, setSaving] = useState(false)
  const [editErr, setEditErr] = useState<string | null>(null)
  const [fFinal, setFFinal] = useState('')
  const [fRetake, setFRetake] = useState('')
  const [fName, setFName] = useState('')
  const [fReason, setFReason] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onSearchChange(v: string) {
    setQuery(v)
    setSelected(null)
    if (debounce.current) clearTimeout(debounce.current)
    if (v.trim().length < 2) { setStudents([]); return }
    debounce.current = setTimeout(async () => {
      setSearching(true)
      const res = await fetch(`/api/academic/grades?q=${encodeURIComponent(v.trim())}`)
      const data = await res.json()
      setStudents(data.students ?? [])
      setSearching(false)
    }, 350)
  }

  async function selectStudent(s: Student) {
    setSelected(s)
    setStudents([])
    setQuery(s.student_name)
    setLoadingGrades(true)
    setProgramFilter('all')
    const res = await fetch(`/api/academic/grades?document=${encodeURIComponent(s.document_number)}`)
    const data = await res.json()
    setGrades(data.grades ?? [])
    setPrograms(data.programs ?? [])
    setLoadingGrades(false)
  }

  const visibleGrades = programFilter === 'all'
    ? grades
    : grades.filter(g => (g.program_ids ?? []).includes(programFilter))
  const sinPrograma = grades.filter(g => (g.program_ids ?? []).length === 0).length

  function openEdit(g: Grade) {
    setEditing(g)
    setFFinal(g.final_grade == null ? '' : String(g.final_grade))
    setFRetake(g.retake_grade == null ? '' : String(g.retake_grade))
    setFName(g.course_name ?? '')
    setFReason('')
    setEditErr(null)
  }

  async function saveEdit() {
    if (!editing || !selected) return
    if (!fReason.trim()) { setEditErr('El motivo es obligatorio.'); return }
    const num = (s: string): number | null | undefined => {
      const t = s.trim()
      if (t === '') return null
      const n = Number(t)
      return isFinite(n) ? n : undefined
    }
    const final = num(fFinal), retake = num(fRetake)
    if (final === undefined || retake === undefined) { setEditErr('La nota debe ser un número.'); return }
    setSaving(true); setEditErr(null)
    const res = await fetch('/api/academic/grades', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        external_id: editing.external_id,
        changes: { final_grade: final, retake_grade: retake, course_name: fName.trim() || null },
        reason: fReason.trim(),
      }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setEditErr(d.error ?? 'Error al guardar'); return }
    setEditing(null)
    // Recargar: la edición puede cambiar nombre (y con él, el programa asignado)
    setLoadingGrades(true)
    const r2 = await fetch(`/api/academic/grades?document=${encodeURIComponent(selected.document_number)}`)
    const d2 = await r2.json()
    setGrades(d2.grades ?? [])
    setPrograms(d2.programs ?? [])
    setLoadingGrades(false)
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar estudiante por nombre o número de documento…"
          className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}

        {students.length > 0 && !selected && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto">
            {students.map(s => (
              <button
                key={s.document_number}
                onClick={() => selectStudent(s)}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0"
              >
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.student_name}</p>
                  <p className="text-xs text-gray-400">Doc: {s.document_number}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <User className="w-5 h-5 text-blue-500" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">{selected.student_name}</p>
              <p className="text-xs text-gray-400">Documento: {selected.document_number}</p>
            </div>
          </div>
          {!loadingGrades && programs.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button
                onClick={() => setProgramFilter('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${programFilter === 'all'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                Todos ({grades.length})
              </button>
              {programs.map(p => {
                const n = grades.filter(g => (g.program_ids ?? []).includes(p.id)).length
                return (
                  <button
                    key={p.id}
                    onClick={() => setProgramFilter(p.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${programFilter === p.id
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {p.name} ({n})
                  </button>
                )
              })}
              {programFilter !== 'all' && sinPrograma > 0 && (
                <span className="text-[11px] text-gray-400">
                  {sinPrograma} nota{sinPrograma > 1 ? 's' : ''} sin asignatura en la malla — visible{sinPrograma > 1 ? 's' : ''} en “Todos”
                </span>
              )}
            </div>
          )}
          {loadingGrades
            ? <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
            : <GradesTable grades={visibleGrades} onEdit={openEdit} />}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => !saving && setEditing(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Editar nota</p>
              <button onClick={() => setEditing(null)} disabled={saving} className="p-1 rounded text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Asignatura</label>
                <input value={fName} onChange={e => setFName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-[11px] text-gray-400 mt-1">Corregir el nombre re-engancha la nota con la malla del programa.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nota final</label>
                  <input value={fFinal} onChange={e => setFFinal(e.target.value)} inputMode="decimal" placeholder="—"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Recuperación</label>
                  <input value={fRetake} onChange={e => setFRetake(e.target.value)} inputMode="decimal" placeholder="—"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Motivo del cambio <span className="text-red-500">*</span></label>
                <textarea value={fReason} onChange={e => setFReason(e.target.value)} rows={2}
                  placeholder="Ej.: corrección de acta, nota mal migrada desde SystemActiva…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-[11px] text-gray-400 mt-1">Queda en la auditoría junto con el valor anterior y quién hizo el cambio.</p>
              </div>
              {editErr && <p className="text-xs text-red-600">{editErr}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100">
              <button onClick={() => setEditing(null)} disabled={saving}
                className="px-3.5 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 border border-gray-300">Cancelar</button>
              <button onClick={saveEdit} disabled={saving}
                className="px-3.5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
