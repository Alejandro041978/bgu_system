'use client'

import { useRouter, usePathname } from 'next/navigation'

interface Category { id: string; name: string }

interface Props {
  years: number[]
  blocks: string[]
  categories: Category[]
  selectedYear: number | null
  selectedBlock: string | null
  selectedCategory: string | null
}

const BLOCK_LABELS: Record<string, string> = {
  '1': 'Semestre 1',
  '2': 'Semestre 2',
  '3': 'Semestre 3',
}

export function MatriculasFilters({ years, blocks, categories, selectedYear, selectedBlock, selectedCategory }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  function update(year: number | null, block: string | null, category: string | null) {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (year) params.set('year', String(year))
    if (block) params.set('block', block)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="space-y-2">
      {/* Categoría (selector superior) */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Categoría:</span>
        <select
          value={selectedCategory ?? ''}
          onChange={e => update(selectedYear, selectedBlock, e.target.value || null)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[240px]"
        >
          <option value="">Todas las categorías</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Año */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
          <button
            onClick={() => update(null, selectedBlock, selectedCategory)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              !selectedYear ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Todos los años
          </button>
          {years.map(y => (
            <button
              key={y}
              onClick={() => update(y, selectedBlock, selectedCategory)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedYear === y ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Semestre */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
          <button
            onClick={() => update(selectedYear, null, selectedCategory)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              !selectedBlock ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Todos los semestres
          </button>
          {blocks.map(b => (
            <button
              key={b}
              onClick={() => update(selectedYear, b, selectedCategory)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedBlock === b ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {BLOCK_LABELS[b] ?? `Semestre ${b}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
