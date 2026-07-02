'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Search, ChevronRight, CheckCircle2, Clock, AlertCircle, Calendar } from 'lucide-react'

type EmployeeRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
  position: string | null
  employee_type: 'direct' | 'contractor' | 'external'
  active_contract_id: string | null
  active_position: string | null
  latest_contract_end: string | null
  contract_count: number
  created_at: string | null
}

const TYPE_LABEL: Record<string, string> = {
  direct: 'Directo',
  contractor: 'Contratista',
  external: 'Externo',
}

const TYPE_COLOR: Record<string, string> = {
  direct: 'bg-blue-100 text-blue-700',
  contractor: 'bg-purple-100 text-purple-700',
  external: 'bg-orange-100 text-orange-700',
}

function StatusBadge({ employee }: { employee: EmployeeRow }) {
  if (employee.active_contract_id) {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full font-medium">
        <CheckCircle2 className="w-3 h-3" />
        Con contrato
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full font-medium">
      <AlertCircle className="w-3 h-3" />
      Sin contrato
    </span>
  )
}

export function EmployeeList({ employees }: { employees: EmployeeRow[] }) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = employees.filter(e => {
    const matchSearch =
      !search ||
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase()) ||
      (e.active_position ?? '').toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || e.employee_type === typeFilter
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && e.active_contract_id) ||
      (statusFilter === 'inactive' && !e.active_contract_id)
    return matchSearch && matchType && matchStatus
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o cargo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todos los tipos</option>
          <option value="direct">Directos</option>
          <option value="contractor">Contratistas</option>
          <option value="external">Externos</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos / Vencidos</option>
        </select>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">
          No se encontraron colaboradores
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Colaborador</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cargo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contratos</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Último ingreso</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(e => (
              <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {e.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{e.full_name}</p>
                      <p className="text-xs text-gray-400">{e.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-gray-600">{e.active_position ?? e.position ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${TYPE_COLOR[e.employee_type]}`}>
                    {TYPE_LABEL[e.employee_type]}
                  </span>
                </td>
                <td className="px-4 py-4"><StatusBadge employee={e} /></td>
                <td className="px-4 py-4 text-gray-500">{e.contract_count}</td>
                <td className="px-4 py-4 text-xs text-gray-500">
                  {e.created_at ? (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(e.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-4">
                  <Link href={`/hr/${e.id}`} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors inline-flex">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
