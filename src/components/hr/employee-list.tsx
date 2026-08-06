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
  user_id: string | null
  is_faculty?: boolean
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
  const [hideFaculty, setHideFaculty] = useState(false)

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
    // Se ocultan los faculty SIN usuario del ERP. Quien es docente y además
    // colabora en la operación sí tiene usuario, y se queda: la marca de que
    // alguien es algo más que faculty es precisamente tener acceso.
    const matchFaculty = !hideFaculty || !(e.is_faculty && !e.user_id)
    return matchSearch && matchType && matchStatus && matchFaculty
  })
  const ocultos = employees.filter(e => e.is_faculty && !e.user_id).length

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

        {/* El título dice exactamente a quién esconde. "Ocultar faculty" a
            secas haría pensar que también se van los dos que son docentes y
            colaboradores, y esos se quedan. */}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none"
          title="Esconde a los docentes que no tienen usuario del ERP. Quien es faculty y además colabora sí lo tiene, y permanece en la lista.">
          <button type="button" role="switch" aria-checked={hideFaculty}
            onClick={() => setHideFaculty(v => !v)}
            className={`relative w-9 h-5 rounded-full transition-colors ${hideFaculty ? 'bg-blue-600' : 'bg-gray-200'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${hideFaculty ? 'left-[1.125rem]' : 'left-0.5'}`} />
          </button>
          Ocultar faculty sin ERP
          <span className="text-xs text-gray-400 tabular-nums">({ocultos})</span>
        </label>
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
                {/* Tener contrato y tener acceso al ERP son cosas distintas, y
                    la mayoría de colaboradores no necesita lo segundo. Lo que
                    no puede pasar es que no se vea: se descubría cuando alguien
                    pedía recuperar una contraseña que nunca existió. */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge employee={e} />
                    {e.user_id && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full" title="Tiene usuario del ERP">
                        ERP
                      </span>
                    )}
                  </div>
                </td>
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
