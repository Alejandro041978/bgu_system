'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save } from 'lucide-react'

type Role = { id: string; name: string; label: string }
type PermMap = Record<string, { can_view: boolean; can_edit: boolean }>

const PAGE_GROUPS = [
  {
    label: 'General',
    pages: [
      { key: 'dashboard', label: 'Dashboard' },
    ],
  },
  {
    label: 'Atención al Cliente',
    pages: [
      { key: 'desk', label: 'Tickets' },
      { key: 'desk_metrics', label: 'Métricas de tickets' },
    ],
  },
  {
    label: 'Finanzas',
    pages: [
      { key: 'finance', label: 'Contabilidad' },
    ],
  },
  {
    label: 'CRM',
    pages: [
      { key: 'crm', label: 'Contactos' },
    ],
  },
  {
    label: 'Redes Sociales',
    pages: [
      { key: 'social', label: 'Métricas sociales' },
    ],
  },
  {
    label: 'Talento Humano',
    pages: [
      { key: 'hr', label: 'Colaboradores' },
      { key: 'kpis', label: 'KPIs & Bonos' },
      { key: 'contracts', label: 'Contratos · Lista' },
      { key: 'contracts_new', label: 'Contratos · Nuevo' },
      { key: 'contracts_templates', label: 'Contratos · Plantillas' },
    ],
  },
  {
    label: 'Académico',
    pages: [
      { key: 'academic_faculty', label: 'Docentes' },
      { key: 'academic_years', label: 'Años y Semestres' },
      { key: 'academic_programs', label: 'Programas' },
      { key: 'academic_offer', label: 'Oferta académica' },
      { key: 'academic_schedules', label: 'Cronogramas' },
    ],
  },
  {
    label: 'Convenios',
    pages: [
      { key: 'convenios', label: 'Convenios institucionales' },
    ],
  },
  {
    label: 'Planeamiento',
    pages: [
      { key: 'planning_plan', label: 'Plan Estratégico · Cargar Plan' },
      { key: 'planning_progress', label: 'Plan Estratégico · Reportar Avances' },
      { key: 'planning_dashboard', label: 'Plan Estratégico · Dashboard' },
      { key: 'effectiveness_kpis', label: 'Plan de Efectividad · KPIs' },
      { key: 'effectiveness_plan', label: 'Plan de Efectividad · Cargar Plan' },
      { key: 'effectiveness_dashboard', label: 'Plan de Efectividad · Dashboard' },
    ],
  },
  {
    label: 'Sofia IA',
    pages: [
      { key: 'chat', label: 'Sofia · Chat' },
      { key: 'settings_sofia', label: 'Sofia · Configuración' },
    ],
  },
  {
    label: 'Administración',
    pages: [
      { key: 'settings_users', label: 'Usuarios y permisos' },
    ],
  },
]

export function PermissionsTab({ roles }: { roles: Role[] }) {
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? '')
  const [perms, setPerms] = useState<PermMap>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const loadPerms = useCallback(async () => {
    if (!selectedRoleId) return
    setLoading(true)
    const res = await fetch(`/api/settings/permissions?role_id=${selectedRoleId}`)
    const data = await res.json() as { page_key: string; can_view: boolean; can_edit: boolean }[]
    const map: PermMap = {}
    if (Array.isArray(data)) {
      data.forEach(p => { map[p.page_key] = { can_view: p.can_view, can_edit: p.can_edit } })
    }
    setPerms(map)
    setLoading(false)
  }, [selectedRoleId])

  useEffect(() => { loadPerms() }, [loadPerms])

  function toggle(pageKey: string, field: 'can_view' | 'can_edit') {
    setPerms(prev => {
      const curr = prev[pageKey] ?? { can_view: false, can_edit: false }
      const updated = { ...curr, [field]: !curr[field] }
      // can_edit implica can_view
      if (field === 'can_edit' && updated.can_edit) updated.can_view = true
      // quitar can_view quita can_edit
      if (field === 'can_view' && !updated.can_view) updated.can_edit = false
      return { ...prev, [pageKey]: updated }
    })
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    const permissions = Object.entries(perms).map(([page_key, p]) => ({
      page_key,
      can_view: p.can_view,
      can_edit: p.can_edit,
    }))
    await fetch('/api/settings/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: selectedRoleId, permissions }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const selectedRole = roles.find(r => r.id === selectedRoleId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Rol:</span>
          <select
            value={selectedRoleId}
            onChange={e => setSelectedRoleId(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white'
          }`}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar'}
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-10 text-sm">Cargando...</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Página</th>
                <th className="text-center px-5 py-3 w-32">Puede ver</th>
                <th className="text-center px-5 py-3 w-32">Puede editar</th>
              </tr>
            </thead>
            <tbody>
              {PAGE_GROUPS.map(group => (
                <>
                  <tr key={group.label} className="bg-gray-800/60">
                    <td colSpan={3} className="px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {group.label}
                    </td>
                  </tr>
                  {group.pages.map(page => {
                    const p = perms[page.key] ?? { can_view: false, can_edit: false }
                    return (
                      <tr key={page.key} className="border-t border-gray-800/50 hover:bg-gray-800/20">
                        <td className="px-5 py-3 text-gray-200">{page.label}</td>
                        <td className="px-5 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={p.can_view}
                            onChange={() => toggle(page.key, 'can_view')}
                            className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-5 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={p.can_edit}
                            onChange={() => toggle(page.key, 'can_edit')}
                            className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
