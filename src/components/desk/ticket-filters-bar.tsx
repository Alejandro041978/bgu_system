'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Search, Filter } from 'lucide-react'
import { useCallback } from 'react'
import type { ZohoDepartment } from '@/types/zoho'
import { cn } from '@/lib/utils'

interface TicketFiltersBarProps {
  departments: ZohoDepartment[]
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'Open', label: 'Abiertos' },
  { value: 'In Progress', label: 'En Proceso' },
  { value: 'On Hold', label: 'En Espera' },
  { value: 'Closed', label: 'Cerrados' },
]

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'Prioridad' },
  { value: 'Urgent', label: 'Urgente' },
  { value: 'High', label: 'Alta' },
  { value: 'Medium', label: 'Media' },
  { value: 'Low', label: 'Baja' },
]

export function TicketFiltersBar({ departments }: TicketFiltersBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const currentStatus = searchParams.get('status') ?? 'all'
  const currentPriority = searchParams.get('priority') ?? 'all'
  const currentDept = searchParams.get('department') ?? 'all'

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl border border-gray-200">
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar tickets..."
          defaultValue={searchParams.get('search') ?? ''}
          onChange={(e) => {
            const val = e.target.value
            const timer = setTimeout(() => updateParam('search', val), 400)
            return () => clearTimeout(timer)
          }}
          className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        <select
          value={currentStatus}
          onChange={(e) => updateParam('status', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={currentPriority}
          onChange={(e) => updateParam('priority', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PRIORITY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={currentDept}
          onChange={(e) => updateParam('department', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todos los Dptos</option>
          {departments.map(dept => (
            <option key={dept.id} value={dept.id}>{dept.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
