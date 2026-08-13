'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save } from 'lucide-react'

type Role = { id: string; name: string; label: string }
type PermMap = Record<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }>

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
      { key: 'report_portal_logins', label: 'Reportes · Accesos al Portal' },
      { key: 'report_graduates', label: 'Reportes · Egresados' },
      { key: 'report_grades', label: 'Reportes · Calificaciones' },
      { key: 'academic_curricular_coverage', label: 'Académico · Cobertura del registro' },
      { key: 'academic_collection_backfill', label: 'Académico · Colección por matrícula' },
      { key: 'academic_link_audit', label: 'Académico · Auditor de vínculos de aula' },
      { key: 'academic_acta_course', label: 'Académico · Acta de Asignatura' },
    ],
  },
  {
    label: 'Comercial',
    pages: [
      // Admisión
      { key: 'crm', label: 'Contactos / CRM' },
      { key: 'convenios', label: 'Convenios institucionales' },
      { key: 'admision_matriculas', label: 'Matrículas' },
      { key: 'admision_nueva_matricula', label: 'Nueva Matrícula' },
      // Ventas
      { key: 'sales_prospectos', label: 'Prospectos' },
      { key: 'sales_funnels', label: 'Configuración de embudos' },
      // Redes Sociales
      { key: 'social', label: 'Métricas sociales' },
      // Convocatorias: el mismo grupo y el mismo orden que el sidebar, para
      // que dar permiso a un llamado no obligue a buscar sus páginas por tres
      // secciones distintas.
      { key: 'academic_convocatorias', label: 'Convocatorias · Gestión' },
      { key: 'academic_convocatorias_report', label: 'Convocatorias · Matrículas' },
      { key: 'academic_convocatoria_students', label: 'Convocatorias · Estudiantes' },
      { key: 'admissions_sales', label: 'Convocatorias · Ventas' },
      { key: 'admissions_documents', label: 'Convocatorias · Documentos de Postulación' },
    ],
  },
  {
    label: 'Services',
    pages: [
      // Atención al Cliente
      { key: 'chat', label: 'Sofia · Chat' },
      { key: 'desk', label: 'Tickets · Histórico (Zoho)' },
      { key: 'inbox', label: 'Bandeja Helpdesk' },
      { key: 'inbox_metrics', label: 'Buzón · Métricas' },
      { key: 'helpdesk_skills', label: 'Helpdesk · Skills' },
      { key: 'desk_metrics', label: 'Métricas de tickets · Histórico (Zoho)' },
      // Registrar
      { key: 'registrar_formatos', label: 'Formatos de certificados' },
      { key: 'registrar_document_types', label: 'Tipos de Documento' },
      { key: 'registrar_requests', label: 'Solicitudes de Documentos' },
      { key: 'registrar_degrees', label: 'Degrees · Hoja de Control' },
      { key: 'registrar_isic_cards', label: 'Carnés ISIC · Licencias' },
      { key: 'registrar_tramites', label: 'Trámites' },
    ],
  },
  {
    label: 'Académico',
    pages: [
      { key: 'academic_student_profile', label: 'Ficha del Estudiante' },
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
      { key: 'academic_external_campus', label: 'Notas de campus externo' },
      { key: 'academic_capstone', label: 'Notas de Capstone' },
      { key: 'academic_acta', label: 'Acta Personal' },
      { key: 'academic_acta_detail', label: 'Acta Detallada' },
      { key: 'academic_curricular', label: 'Registro Curricular (retiro de asignaturas)' },
      { key: 'academic_exams', label: 'Exámenes · Hoja de Control' },
      // Convalidaciones
      { key: 'academic_transfer_credits', label: 'Convalidaciones · Individual' },
      { key: 'academic_transfer_schemes', label: 'Convalidaciones · Esquemas masivos' },
      { key: 'academic_validations', label: 'Validación de asignaturas' },
      { key: 'academic_grade_scales', label: 'Escalas de conversión' },
      // Gestión académica
      { key: 'academic_years', label: 'Años y Semestres' },
      { key: 'academic_programs', label: 'Programas' },
      { key: 'academic_syllabi', label: 'Sílabos' },
      { key: 'academic_course_sync', label: 'Sincronizar asignatura' },
      { key: 'academic_offer', label: 'Oferta académica' },
      { key: 'academic_groups', label: 'Grupos' },
      { key: 'academic_carousels', label: 'Carruseles' },
      { key: 'academic_schedules', label: 'Cronogramas' },
    ],
  },
  {
    label: 'Planeamiento',
    pages: [
      { key: 'planning_plan', label: 'Plan Estratégico · Cargar Plan' },
      { key: 'planning_indicators', label: 'Plan Estratégico · Tablero de Indicadores' },
      { key: 'planning_progress', label: 'Plan Estratégico · Reportar Avances' },
      { key: 'planning_dashboard', label: 'Plan Estratégico · Dashboard' },
      { key: 'effectiveness_kpis', label: 'Plan de Efectividad · KPIs' },
      { key: 'effectiveness_plan', label: 'Plan de Efectividad · Cargar Plan' },
      { key: 'effectiveness_dashboard', label: 'Plan de Efectividad · Dashboard' },
      { key: 'assessment_plan', label: 'Plan de Evaluación · Cargar Plan' },
      { key: 'assessment_measures', label: 'Plan de Evaluación · Tablero de Medidas' },
      { key: 'assessment_dashboard', label: 'Plan de Evaluación · Dashboard' },
      { key: 'planning_overview', label: 'Panorama Institucional (los tres planes)' },
      { key: 'planning_audit', label: 'Auditor de Planeamiento' },
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
      { key: 'finance_recaudacion', label: 'Finanzas · Recaudación' },
      { key: 'finance_flywire_import', label: 'Finanzas · Cargar Pagos Flywire' },
      { key: 'finance_conciliar', label: 'Finanzas · Pagos por Conciliar' },
      { key: 'finance_flywire_unmatched', label: 'Finanzas · Flywire sin conciliar' },
      { key: 'finance_reconciliation', label: 'Finanzas · Auditor de Conciliación' },
      { key: 'finance_other_income', label: 'Finanzas · Otros Ingresos' },
      { key: 'finance_debt_report', label: 'Finanzas · Reporte de Deuda' },
      { key: 'finance_debtors', label: 'Finanzas · Relación de Deudores' },
      { key: 'finance_credit_rates', label: 'Finanzas · Credit Rate' },
      { key: 'admissions_commissions', label: 'Admisión · Comisiones' },
      { key: 'admissions_referrals', label: 'Admisión · Free Degree (referidos)' },
      { key: 'collection_scholarships', label: 'Collection · Becas' },
      { key: 'collection_bonuses', label: 'Collection · Bonos' },
      { key: 'moodle_access', label: 'Collection · Acceso a Moodle' },
      { key: 'finance_cashpay', label: 'Collection · Cashpay' },
      { key: 'report_tuition_audit', label: 'Reportes · Auditoría de Tuition' },
      { key: 'seguimiento_campaigns', label: 'Seguimiento · Campañas' },
      { key: 'finance_books_operations', label: 'Finanzas · Operaciones Books' },
      // Cuentas (movidas de Académico)
      { key: 'academic_account', label: 'Estado de Cuenta' },
      { key: 'academic_concepts', label: 'Conceptos de Cuenta' },
      { key: 'academic_billing_plans', label: 'Plantillas de Facturación' },
      // Administración del sistema
      { key: 'settings_users', label: 'Usuarios y permisos' },
    ],
  },
]

type Member = { id: string; full_name: string | null; email: string | null; position: string | null }

export function PermissionsTab({ roles }: { roles: Role[] }) {
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? '')
  const [perms, setPerms] = useState<PermMap>({})
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const loadPerms = useCallback(async () => {
    if (!selectedRoleId) return
    setLoading(true)
    const res = await fetch(`/api/settings/permissions?role_id=${selectedRoleId}`)
    const data = await res.json() as { page_key: string; can_view: boolean; can_edit: boolean; can_delete?: boolean }[]
    const map: PermMap = {}
    if (Array.isArray(data)) {
      data.forEach(p => { map[p.page_key] = { can_view: p.can_view, can_edit: p.can_edit, can_delete: !!p.can_delete } })
    }
    setPerms(map)
    setLoading(false)
  }, [selectedRoleId])

  useEffect(() => { loadPerms() }, [loadPerms])

  // Colaboradores que tienen el rol seleccionado (panel lateral)
  useEffect(() => {
    if (!selectedRoleId) { setMembers([]); return }
    fetch(`/api/settings/role-members?role_id=${selectedRoleId}`)
      .then(r => r.json()).then(d => setMembers(d.employees ?? [])).catch(() => setMembers([]))
  }, [selectedRoleId])

  // Jerarquía: borrar implica editar, y editar implica ver. Quitar de arriba
  // arrastra lo de abajo, para que no queden combinaciones que nadie sabe leer
  // —"puede borrar pero no ver"— y que el servidor tendría que interpretar.
  function toggle(pageKey: string, field: 'can_view' | 'can_edit' | 'can_delete') {
    setPerms(prev => {
      const curr = prev[pageKey] ?? { can_view: false, can_edit: false, can_delete: false }
      const updated = { ...curr, [field]: !curr[field] }
      if (field === 'can_delete' && updated.can_delete) { updated.can_edit = true; updated.can_view = true }
      if (field === 'can_edit') {
        if (updated.can_edit) updated.can_view = true
        else updated.can_delete = false
      }
      if (field === 'can_view' && !updated.can_view) { updated.can_edit = false; updated.can_delete = false }
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
      can_delete: p.can_delete,
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

      <AuditoriaPermisos roleId={selectedRoleId} />

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
      {loading ? (
        <p className="text-center text-gray-500 py-10 text-sm">Cargando...</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Página</th>
                <th className="text-center px-5 py-3 w-28">Puede ver</th>
                <th className="text-center px-5 py-3 w-28">Puede editar</th>
                <th className="text-center px-5 py-3 w-28">Puede borrar</th>
              </tr>
            </thead>
            <tbody>
              {PAGE_GROUPS.map(group => (
                <>
                  <tr key={group.label} className="bg-gray-800/60">
                    <td colSpan={4} className="px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {group.label}
                    </td>
                  </tr>
                  {group.pages.map(page => {
                    const p = perms[page.key] ?? { can_view: false, can_edit: false, can_delete: false }
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
                        <td className="px-5 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={p.can_delete}
                            onChange={() => toggle(page.key, 'can_delete')}
                            className="w-4 h-4 rounded accent-red-500 cursor-pointer"
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

        {/* Panel lateral: colaboradores con el rol seleccionado */}
        <aside className="w-60 shrink-0">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sticky top-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Colaboradores con este rol
            </p>
            {members.length === 0 ? (
              <p className="text-xs text-gray-500">Ningún colaborador tiene este rol.</p>
            ) : (
              <ul className="space-y-2">
                {members.map(m => (
                  <li key={m.id} className="text-sm">
                    <span className="text-gray-200">{m.full_name ?? '—'}</span>
                    {(m.position || m.email) && (
                      <span className="block text-[11px] text-gray-500 truncate">{m.position || m.email}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 pt-3 border-t border-gray-800 text-[11px] text-gray-500">
              {members.length} colaborador(es)
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lo que el permiso HABRÍA bloqueado.
//
// La comprobación arranca en modo auditoría: no niega nada, anota. Esta tabla
// es la lista con la que se corrigen los roles antes de poner el modo
// estricto — porque la configuración actual nunca se sintió y no describe cómo
// trabaja la gente. Casi todo lo que salga aquí es trabajo legítimo al que le
// falta la casilla, no un intento de hacer algo indebido.
// ---------------------------------------------------------------------------
interface FilaAudit {
  role_id: string; rol: string; page_key: string; accion: string
  intentos: number; personas: string[]; ultima: string; rutas: string[]; bloqueado: boolean
}

function AuditoriaPermisos({ roleId }: { roleId: string }) {
  const [datos, setDatos] = useState<{ modo: string; eventos: number; resumen: FilaAudit[] } | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    fetch('/api/settings/permission-audit?dias=14').then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else { setDatos(d); setError(null) } })
      .catch(() => setError('Error de red'))
  }, [abierto])

  const suyas = (datos?.resumen ?? []).filter(f => !roleId || f.role_id === roleId)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button onClick={() => setAbierto(v => !v)} className="w-full flex items-center justify-between px-5 py-3 text-left">
        <span className="text-sm font-medium text-gray-200">
          Auditoría de permisos
          {datos && <span className="ml-2 text-xs text-gray-500">
            modo {datos.modo === 'estricto' ? 'estricto (bloquea)' : 'auditoría (no bloquea, solo anota)'} · últimos 14 días
          </span>}
        </span>
        <span className="text-xs text-gray-500">{abierto ? 'ocultar' : 'ver'}</span>
      </button>

      {abierto && (
        <div className="border-t border-gray-800 px-5 py-4 space-y-3">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!error && !datos && <p className="text-sm text-gray-500">Cargando…</p>}
          {datos && suyas.length === 0 && (
            <p className="text-sm text-gray-500">
              Nada registrado para este rol. O no le falta ningún permiso, o todavía no ha usado esas pantallas
              desde que se activó la auditoría.
            </p>
          )}
          {datos && suyas.length > 0 && (
            <>
              <p className="text-xs text-gray-400">
                Estas acciones se dejaron pasar, pero en modo estricto se bloquearían. Si son parte del trabajo de
                este rol, marca la casilla que corresponde arriba y guarda.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 uppercase tracking-wide border-b border-gray-800">
                    <th className="text-left px-2 py-2">Página</th>
                    <th className="text-left px-2 py-2 w-24">Acción</th>
                    <th className="text-right px-2 py-2 w-20">Veces</th>
                    <th className="text-left px-2 py-2">Quién</th>
                  </tr>
                </thead>
                <tbody>
                  {suyas.map(f => (
                    <tr key={`${f.page_key}|${f.accion}`} className="border-t border-gray-800/50">
                      <td className="px-2 py-2 text-gray-200">{f.page_key}</td>
                      <td className={`px-2 py-2 ${f.accion === 'borrar' ? 'text-red-400' : 'text-amber-400'}`}>{f.accion}</td>
                      <td className="px-2 py-2 text-right text-gray-300">{f.intentos}</td>
                      <td className="px-2 py-2 text-gray-500 text-xs">{f.personas.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}
