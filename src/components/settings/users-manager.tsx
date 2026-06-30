'use client'

import { useState } from 'react'
import { Users, Shield, Lock, Plus, Trash2, Save } from 'lucide-react'
import { RolesTab } from './roles-tab'
import { PermissionsTab } from './permissions-tab'

type Employee = {
  id: string
  full_name: string
  email: string
  position: string | null
  employee_type: string
  role_id: string | null
  role: { id: string; label: string } | null
}

type Role = { id: string; name: string; label: string }

type Tab = 'users' | 'roles' | 'permissions'

const TYPE_LABEL: Record<string, string> = {
  direct: 'Directo', contractor: 'Contratista', external: 'Externo',
}

export function UsersManager({ employees: initial, roles: initialRoles }: { employees: Employee[]; roles: Role[] }) {
  const [tab, setTab] = useState<Tab>('users')
  const [employees, setEmployees] = useState(initial)
  const [roles, setRoles] = useState(initialRoles)
  const [saving, setSaving] = useState<string | null>(null)

  async function updateRole(employeeId: string, roleId: string | null) {
    setSaving(employeeId)
    await fetch('/api/settings/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: employeeId, role_id: roleId }),
    })
    setEmployees(prev => prev.map(e =>
      e.id === employeeId
        ? { ...e, role_id: roleId, role: roleId ? (roles.find(r => r.id === roleId) ?? null) : null }
        : e
    ))
    setSaving(null)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-blue-400" />
          <h1 className="text-base font-bold">Administración de Usuarios</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <div className="flex">
          {([
            { key: 'users', label: 'Usuarios', icon: Users },
            { key: 'roles', label: 'Roles', icon: Shield },
            { key: 'permissions', label: 'Permisos por rol', icon: Lock },
          ] as { key: Tab; label: string; icon: typeof Users }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? 'border-blue-500 text-white bg-blue-600/10'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === 'users' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Colaborador</th>
                  <th className="text-left px-5 py-3">Tipo</th>
                  <th className="text-left px-5 py-3">Rol en el sistema</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-10 text-gray-500 text-sm">
                      No hay colaboradores registrados. Ve a <a href="/hr/new" className="text-blue-400 underline">Colaboradores</a> para agregar.
                    </td>
                  </tr>
                ) : employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {emp.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                        </div>
                        <div>
                          <p className="font-medium text-white">{emp.full_name}</p>
                          <p className="text-xs text-gray-500">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {TYPE_LABEL[emp.employee_type] ?? emp.employee_type}
                      {emp.position && <span className="block text-gray-500">{emp.position}</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <select
                          value={emp.role_id ?? ''}
                          onChange={e => updateRole(emp.id, e.target.value || null)}
                          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-40"
                        >
                          <option value="">Sin rol</option>
                          {roles.map(r => (
                            <option key={r.id} value={r.id}>{r.label}</option>
                          ))}
                        </select>
                        {saving === emp.id && (
                          <span className="text-xs text-gray-500">Guardando...</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'roles' && (
          <RolesTab roles={roles} onRolesChange={setRoles} employees={employees} />
        )}

        {tab === 'permissions' && (
          <PermissionsTab roles={roles} />
        )}
      </div>
    </div>
  )
}
