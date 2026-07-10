'use client'

import { useState, useRef } from 'react'
import { Search, Loader2, User } from 'lucide-react'
import { GradesTable, type Grade } from './grades-table'

interface Student { document_number: string; student_name: string }

export function GradesExplorer() {
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Student | null>(null)
  const [grades, setGrades] = useState<Grade[]>([])
  const [loadingGrades, setLoadingGrades] = useState(false)
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
    const res = await fetch(`/api/academic/grades?document=${encodeURIComponent(s.document_number)}`)
    const data = await res.json()
    setGrades(data.grades ?? [])
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
          {loadingGrades
            ? <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
            : <GradesTable grades={grades} />}
        </div>
      )}
    </div>
  )
}
