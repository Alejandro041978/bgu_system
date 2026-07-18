'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save } from 'lucide-react'

type Role = { id: string; name: string; label: string }
type PermMap = Record<string, { can_view: boolean; can_edit: boolean }>

// El orden y la agrupación reflejan el sidebar (Comercial, Services, Administration…).
const PAGE_GROUPS = [
  {
    label: 'General',
    pages: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'report_student_status', label: 'Reportes · Estado de estudiantes' },
      { key: 'report_faculty_status', label: 'Reportes · Estado de los docentes' },
      { key: 'academic_moodle_actas', label: 'Académico · Actas de Moodle' },
      { key: 'academic_grades_import', label: 'Académico · Cargar Notas (CSV)' },
      { key: 'report_campus_audit', label: 'Reportes · Auditor del Campus' },
    ],
  },
  {
    label: 'Comercial',
    pages: [
      // Admisión
      { key: 'crm', label: 'Contactos / CRM' },
      { key: 'convenios', label: 'Convenios institucionales' },
      { key: 'admision_matriculas', label: 'Matrículas' },
      // Ventas
      { key: 'sales_prospectos', label: 'Prospectos' },
      { key: 'sales_funnels', label: 'Configuración de embudos' },
      // Redes Sociales
      { key: 'social', label: 'Métricas sociales' },
      { key: 'academic_convocatorias', label: 'Convocatorias' },
    ],
  },
  {
    label: 'Services',
    pages: [
      // Atención al Cliente
      { key: 'chat', label: 'Sofia · Chat' },
      { key: 'desk', label: 'Tickets' },
      { key: 'inbox', label: 'Buzón WhatsApp/Correo' },
      { key: 'inbox_metrics', label: 'Buzón · Métricas' },
      { key: 'helpdesk_skills', label: 'Helpdesk · Skills' },
      { key: 'desk_metrics', label: 'Métricas de tickets' },
      // Registrar
      { key: 'registrar_formatos', label: 'Formatos de certificados' },
      { key: 'registrar_document_types', label: 'Tipos de Documento' },
      { key: 'registrar_requests', label: 'Solicitudes de Documentos' },
    ],
  },
  {
    label: 'Académico',
    pages: [
      { key: 'academic_tracking', label: 'Seguimiento estudiantil' },
      { key: 'academic_camila', label: 'Camila · Tablero de retención' },
      { key: 'academic_retention', label: 'Retención (solicitudes de retiro)' },
      { key: 'academic_withdrawals', label: 'Retiros (IW / LOA)' },
      // Docentes
      { key: 'academic_faculty', label: 'Docentes · Nómina' },
      { key: 'academic_credentials', label: 'Docentes · Credencial' },
      { key: 'academic_teaching', label: 'Docentes · Asignación Docente' },
      // Calificaciones
      { key: 'academic_grades', label: 'Notas' },
      { key: 'academic_acta', label: 'Acta Personal' },
      { key: 'academic_acta_detail', label: 'Acta Detallada' },
      // Convalidaciones
      { key: 'academic_transfer_credits', label: 'Convalidaciones · Individual' },
      { key: 'academic_transfer_schemes', label: 'Convalidaciones · Esquemas masivos' },
      { key: 'academic_validations', label: 'Validación de asignaturas' },
      { key: 'academic_grade_scales', label: 'Escalas de conversión' },
      // Gestión académica
      { key: 'academic_years', label: 'Años y Semestres' },
      { key: 'academic_programs', label: 'Programas' },
      { key: 'academic_offer', label: 'Oferta académica' },
      { key: 'academic_groups', label: 'Grupos' },
      { key: 'academic_schedules', label: 'Cronogramas' },
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
    label: 'IA',
    pages: [
      { key: 'settings_sofia', label: 'Bots · Configuración' },
      { key: 'sofia_supervisor', label: 'Bots · Supervisor' },
      { key: 'sofia_mejoras', label: 'Bots · Mejora continua' },
    ],
  },
  {
    label: 'Administration',
    pages: [
      // Talento Humano
      { key: 'hr', label: 'Colaboradores' },
      { key: 'kpis', label: 'KPIs & Bonos' },
      { key: 'hr_capacitaciones', label: 'Capacitaciones · Registro' },
      { key: 'hr_capacitacion_participantes', label: 'Capacitaciones · Participantes' },
      { key: 'contracts', label: 'Contratos · Lista' },
      { key: 'contracts_new', label: 'Contratos · Nuevo' },
      { key: 'contracts_templates', label: 'Contratos · Plantillas' },
      // Finanzas
      { key: 'finance', label: 'Contabilidad' },
      // Cuentas (movidas de Académico)
      { key: 'academic_account', label: 'Estado de Cuenta' },
      { key: 'academic_concepts', label: 'Conceptos de Cuenta' },
      { key: 'academic_billing_plans', label: 'Plantillas de Facturación' },
      // Administración del sistema
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
