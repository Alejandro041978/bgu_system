'use client'

import { useRouter, usePathname } from 'next/navigation'

interface Category { id: string; name: string }
interface YearOpt { id: string; name: string }
interface SemOpt { id: string; name: string; year_id: string }

interface Props {
  years: YearOpt[]
  semesters: SemOpt[]
  categories: Category[]
  selectedYear: string | null
  selectedSemester: string | null
  selectedCategory: string | null
}

export function MatriculasFilters({ years, semesters, categories, selectedYear, selectedSemester, selectedCategory }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  function update(year: string | null, semester: string | null, category: string | null) {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (year) params.set('year', year)
    if (semester) params.set('semester', semester)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  // Semestres del año seleccionado (o todos)
  const shownSemesters = selectedYear ? semesters.filter(s => s.year_id === selectedYear) : semesters

  return (
    <div className="space-y-2">
      {/* Categoría */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Categoría:</span>
        <select
          value={selectedCategory ?? ''}
          onChange={e => update(selectedYear, selectedSemester, e.target.value || null)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[240px]"
        >
          <option value="">Todas las categorías</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Año académico */}
        <div className="flex flex-wrap items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
          <button
            onClick={() => update(null, null, selectedCategory)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!selectedYear ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            Todos los años
          </button>
          {years.map(y => (
            <button
              key={y.id}
              onClick={() => update(y.id, null, selectedCategory)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selectedYear === y.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {y.name}
            </button>
          ))}
        </div>

        {/* Semestre académico */}
        <div className="flex flex-wrap items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
          <button
            onClick={() => update(selectedYear, null, selectedCategory)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!selectedSemester ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            Todos los semestres
          </button>
          {shownSemesters.map(s => (
            <button
              key={s.id}
              onClick={() => update(s.year_id, s.id, selectedCategory)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selectedSemester === s.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
