'use client'

import { useRouter, usePathname } from 'next/navigation'

interface Props {
  years: number[]
  blocks: string[]
  selectedYear: number | null
  selectedBlock: string | null
}

const BLOCK_LABELS: Record<string, string> = {
  '1': 'Semestre 1',
  '2': 'Semestre 2',
  '3': 'Semestre 3',
}

export function MatriculasFilters({ years, blocks, selectedYear, selectedBlock }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  function update(year: number | null, block: string | null) {
    const params = new URLSearchParams()
    if (year) params.set('year', String(year))
    if (block) params.set('block', block)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Año */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
        <button
          onClick={() => update(null, selectedBlock)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            !selectedYear ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          Todos los años
        </button>
        {years.map(y => (
          <button
            key={y}
            onClick={() => update(y, selectedBlock)}
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
          onClick={() => update(selectedYear, null)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            !selectedBlock ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          Todos los semestres
        </button>
        {blocks.map(b => (
          <button
            key={b}
            onClick={() => update(selectedYear, b)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedBlock === b ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {BLOCK_LABELS[b] ?? `Semestre ${b}`}
          </button>
        ))}
      </div>
    </div>
  )
}
