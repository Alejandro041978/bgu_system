'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Headphones, DollarSign, Users, BarChart3,
  Share2, UserCog, Settings, LogOut, ChevronDown, ChevronRight,
  Bot, Shield, FileSignature, List, Plus, FileText,
  GraduationCap, CalendarDays, BookOpen, ClipboardList, Target,
  TrendingUp, Gauge, Handshake, Award, MessageSquare, KeyRound, Calculator, FileCheck, Layers, Wallet, Tag, Receipt, UserCheck, Filter, Activity, UserMinus, HeartHandshake, Download, Upload, UserPlus, Banknote, Link2, LogIn, Package, FileWarning, BadgeDollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { usePermissions } from '@/hooks/use-permissions'
import { BrandLogo } from '@/components/brand-logo'

type NavNode = { name: string; href: string; icon: React.ElementType; pageKey?: string; children?: NavNode[] }
type NavGroup = { label: string; items: NavNode[] }

const navigation: NavGroup[] = [
  {
    label: 'General',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, pageKey: 'dashboard' },
      {
        name: 'Reportes', href: '/reports/estado-estudiantes', icon: BarChart3,
        children: [
          { name: 'Estado de estudiantes', href: '/reports/estado-estudiantes', icon: Users, pageKey: 'report_student_status' },
          { name: 'Estado de los docentes', href: '/reports/estado-docentes', icon: GraduationCap, pageKey: 'report_faculty_status' },
          { name: 'Auditor del Campus', href: '/reports/auditor-campus', icon: Shield, pageKey: 'report_campus_audit' },
          { name: 'Accesos al Portal', href: '/reports/accesos-portal', icon: LogIn, pageKey: 'report_portal_logins' },
          { name: 'Egresados', href: '/reports/egresados', icon: GraduationCap, pageKey: 'report_graduates' },
        ],
      },
    ],
  },
  {
    label: 'Comercial',
    items: [
      {
        name: 'Admisión', href: '/crm', icon: Users,
        children: [
          { name: 'Contactos', href: '/crm', icon: Users, pageKey: 'crm' },
          { name: 'Convenios', href: '/convenios', icon: Handshake, pageKey: 'convenios' },
          { name: 'Matrículas', href: '/admision/matriculas', icon: GraduationCap, pageKey: 'admision_matriculas' },
          { name: 'Nueva Matrícula', href: '/admision/nueva-matricula', icon: UserPlus, pageKey: 'admision_nueva_matricula' },
        ],
      },
      {
        name: 'Ventas', href: '/ventas/prospectos', icon: TrendingUp,
        children: [
          { name: 'Prospectos', href: '/ventas/prospectos', icon: TrendingUp, pageKey: 'sales_prospectos' },
          { name: 'Configuración de embudos', href: '/ventas/embudos', icon: Filter, pageKey: 'sales_funnels' },
        ],
      },
      { name: 'Redes Sociales', href: '/social', icon: Share2, pageKey: 'social' },
      {
        name: 'Convocatorias', href: '/academic/convocatorias', icon: ClipboardList,
        children: [
          { name: 'Gestión', href: '/academic/convocatorias', icon: ClipboardList, pageKey: 'academic_convocatorias' },
          { name: 'Matrículas por Convocatoria', href: '/academic/convocatorias-matriculas', icon: Users, pageKey: 'academic_convocatorias_report' },
          { name: 'Estudiantes por Convocatoria', href: '/academic/estudiantes-convocatoria', icon: Users, pageKey: 'academic_convocatoria_students' },
        ],
      },
    ],
  },
  {
    label: 'Services',
    items: [
      {
        name: 'Atención al Cliente', href: '/desk', icon: Headphones,
        children: [
          { name: 'Sofia · Chat', href: '/chat', icon: Bot, pageKey: 'chat' },
          { name: 'Tickets · Histórico', href: '/desk', icon: Headphones, pageKey: 'desk' },
          { name: 'Bandeja Helpdesk', href: '/inbox', icon: MessageSquare, pageKey: 'inbox' },
          { name: 'Buzón · Métricas', href: '/inbox/metrics', icon: BarChart3, pageKey: 'inbox_metrics' },
          { name: 'Helpdesk · Skills', href: '/helpdesk/skills', icon: UserCog, pageKey: 'helpdesk_skills' },
        ],
      },
      {
        name: 'Registrar', href: '/registrar/formatos', icon: FileText,
        children: [
          { name: 'Formatos', href: '/registrar/formatos', icon: Award, pageKey: 'registrar_formatos' },
          { name: 'Tipos de Documento', href: '/registrar/document-types', icon: FileText, pageKey: 'registrar_document_types' },
          { name: 'Solicitudes', href: '/registrar/requests', icon: ClipboardList, pageKey: 'registrar_requests' },
          { name: 'Degrees · Hoja de Control', href: '/registrar/degrees', icon: Award, pageKey: 'registrar_degrees' },
        ],
      },
      {
        name: 'Seguimiento estudiantil', href: '/academic/seguimiento', icon: Activity,
        children: [
          { name: 'Ficha del Estudiante', href: '/academic/estudiantes', icon: UserCog, pageKey: 'academic_student_profile' },
          { name: 'Base de Seguimiento', href: '/academic/seguimiento', icon: Activity, pageKey: 'academic_tracking' },
          { name: 'Camila · Tablero', href: '/academic/camila', icon: Gauge, pageKey: 'academic_camila' },
          { name: 'Retención', href: '/academic/retencion', icon: HeartHandshake, pageKey: 'academic_retention' },
          { name: 'Retiros', href: '/academic/retiros', icon: UserMinus, pageKey: 'academic_withdrawals' },
        ],
      },
    ],
  },
  {
    label: 'Académico',
    items: [
      {
        name: 'Docentes', href: '/academic/faculty', icon: GraduationCap,
        children: [
          { name: 'Nómina', href: '/academic/faculty', icon: GraduationCap, pageKey: 'academic_faculty' },
          { name: 'Credencial', href: '/academic/credentials', icon: Shield, pageKey: 'academic_credentials' },
          { name: 'Asignación Docente', href: '/academic/teaching-assignments', icon: UserCheck, pageKey: 'academic_teaching' },
        ],
      },
      {
        name: 'Calificaciones', href: '/academic/grades', icon: Award, pageKey: 'academic_grades',
        children: [
          { name: 'Notas', href: '/academic/grades', icon: Award, pageKey: 'academic_grades' },
          { name: 'Acta Personal', href: '/academic/acta', icon: FileText, pageKey: 'academic_acta' },
          { name: 'Acta Detallada', href: '/academic/acta-detalle', icon: FileText, pageKey: 'academic_acta_detail' },
          { name: 'Acta de Asignatura', href: '/academic/acta-asignatura', icon: BookOpen, pageKey: 'academic_acta_course' },
          { name: 'Actas de Moodle', href: '/academic/moodle-actas', icon: Download, pageKey: 'academic_moodle_actas' },
          { name: 'Cargar Notas (CSV)', href: '/academic/grades-import', icon: Upload, pageKey: 'academic_grades_import' },
          { name: 'Exámenes · Control', href: '/academic/examenes', icon: FileCheck, pageKey: 'academic_exams' },
        ],
      },
      {
        name: 'Convalidaciones', href: '/academic/transfer-credits', icon: FileCheck, pageKey: 'academic_transfer_credits',
        children: [
          { name: 'Individual', href: '/academic/transfer-credits', icon: FileCheck, pageKey: 'academic_transfer_credits' },
          { name: 'Esquemas masivos', href: '/academic/transfer-schemes', icon: Layers, pageKey: 'academic_transfer_schemes' },
          { name: 'Validación de asignaturas', href: '/academic/validations', icon: FileCheck, pageKey: 'academic_validations' },
          { name: 'Escalas de conversión', href: '/academic/grade-scales', icon: Calculator, pageKey: 'academic_grade_scales' },
        ],
      },
      {
        name: 'Gestión académica', href: '/academic/years', icon: CalendarDays, pageKey: 'academic_years',
        children: [
          { name: 'Años y Semestres', href: '/academic/years', icon: CalendarDays, pageKey: 'academic_years' },
          { name: 'Programas', href: '/academic/programs', icon: BookOpen, pageKey: 'academic_programs' },
          { name: 'Oferta', href: '/academic/offer', icon: ClipboardList, pageKey: 'academic_offer' },
          { name: 'Grupos', href: '/academic/groups', icon: Users, pageKey: 'academic_groups' },
          { name: 'Carruseles', href: '/academic/carruseles', icon: Layers, pageKey: 'academic_carousels' },
          { name: 'Cronogramas', href: '/academic/schedules', icon: CalendarDays, pageKey: 'academic_schedules' },
        ],
      },
    ],
  },
  {
    label: 'Planeamiento',
    items: [
      {
        name: 'Plan Estratégico', href: '/planning/plan', icon: Target, pageKey: 'planning_plan',
        children: [
          { name: 'Cargar Plan', href: '/planning/plan', icon: Target, pageKey: 'planning_plan' },
          { name: 'Reportar Avances', href: '/planning/progress', icon: TrendingUp, pageKey: 'planning_progress' },
          { name: 'Dashboard', href: '/planning/dashboard', icon: Gauge, pageKey: 'planning_dashboard' },
        ],
      },
      {
        name: 'Plan de Efectividad', href: '/planning/effectiveness/kpis', icon: Gauge, pageKey: 'effectiveness_kpis',
        children: [
          { name: 'KPIs', href: '/planning/effectiveness/kpis', icon: Target, pageKey: 'effectiveness_kpis' },
          { name: 'Cargar Plan', href: '/planning/effectiveness/plan', icon: TrendingUp, pageKey: 'effectiveness_plan' },
          { name: 'Dashboard', href: '/planning/effectiveness/dashboard', icon: Gauge, pageKey: 'effectiveness_dashboard' },
        ],
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        name: 'IA', href: '/settings/sofia', icon: Bot,
        children: [
          { name: 'Bots · Configuración', href: '/settings/sofia', icon: Bot, pageKey: 'settings_sofia' },
          { name: 'Bots · Supervisor', href: '/ia/sofia-supervisor', icon: Shield, pageKey: 'sofia_supervisor' },
          { name: 'Bots · Mejora continua', href: '/ia/sofia-mejoras', icon: TrendingUp, pageKey: 'sofia_mejoras' },
        ],
      },
      {
        name: 'Talento Humano', href: '/hr', icon: UserCog,
        children: [
          { name: 'Colaboradores', href: '/hr', icon: UserCog, pageKey: 'hr' },
          { name: 'KPIs & Bonos', href: '/kpis', icon: BarChart3, pageKey: 'kpis' },
          {
            name: 'Capacitaciones', href: '/hr/capacitaciones', icon: GraduationCap,
            children: [
              { name: 'Registro', href: '/hr/capacitaciones', icon: ClipboardList, pageKey: 'hr_capacitaciones' },
              { name: 'Participantes', href: '/hr/capacitaciones/participantes', icon: Users, pageKey: 'hr_capacitacion_participantes' },
            ],
          },
          {
            name: 'Contratos', href: '/contracts', icon: FileSignature,
            children: [
              { name: 'Lista', href: '/contracts', icon: List, pageKey: 'contracts' },
              { name: 'Nuevo', href: '/contracts/new', icon: Plus, pageKey: 'contracts_new' },
              { name: 'Plantillas', href: '/contracts/templates', icon: FileText, pageKey: 'contracts_templates' },
            ],
          },
        ],
      },
      {
        name: 'Finanzas', href: '/finance', icon: DollarSign,
        children: [
          { name: 'Contabilidad', href: '/finance', icon: DollarSign, pageKey: 'finance' },
          { name: 'Recaudación', href: '/finance/recaudacion', icon: Banknote, pageKey: 'finance_recaudacion' },
          { name: 'Cargar Pagos Flywire', href: '/finance/flywire', icon: Upload, pageKey: 'finance_flywire_import' },
          { name: 'Pagos por Conciliar', href: '/finance/conciliar', icon: Link2, pageKey: 'finance_conciliar' },
          { name: 'Otros Ingresos', href: '/finance/otros-ingresos', icon: Package, pageKey: 'finance_other_income' },
          { name: 'Reporte de Deuda', href: '/finance/debt-report', icon: FileWarning, pageKey: 'finance_debt_report' },
          { name: 'Tarifas por Crédito', href: '/finance/credit-rates', icon: BadgeDollarSign, pageKey: 'finance_credit_rates' },
        ],
      },
      { name: 'Estado de Cuenta', href: '/academic/account', icon: Wallet, pageKey: 'academic_account' },
      { name: 'Conceptos de Cuenta', href: '/academic/concepts', icon: Tag, pageKey: 'academic_concepts' },
      { name: 'Plantillas de Facturación', href: '/academic/billing-plans', icon: Receipt, pageKey: 'academic_billing_plans' },
      { name: 'Usuarios y permisos', href: '/settings/users', icon: Shield, pageKey: 'settings_users' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { canView, superadmin } = usePermissions()
  const [userName, setUserName] = useState<string | null>(null)

  // One group open at a time (accordion)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  // Sub-item expansion within a group (keyed by node href)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // ¿El nodo (o algún descendiente) es visible según permisos?
  function hasVisibleLeaf(node: NavNode): boolean {
    if (node.children?.length) return node.children.some(hasVisibleLeaf)
    return !node.pageKey || canView(node.pageKey)
  }
  // ¿El nodo (o algún descendiente) corresponde a la ruta activa?
  function nodeActive(node: NavNode): boolean {
    if (node.children?.length) return node.children.some(nodeActive)
    return pathname === node.href || pathname.startsWith(node.href + '/')
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      const name = user?.user_metadata?.full_name as string | undefined
      setUserName(name ?? user?.email ?? null)
    })
  }, [])

  // Abre el grupo y expande la cadena de ancestros que corresponde a la ruta actual
  useEffect(() => {
    function findTrail(nodes: NavNode[], trail: string[]): boolean {
      for (const node of nodes) {
        if (node.children?.length) {
          if (findTrail(node.children, trail)) { trail.push(node.href); return true }
        } else if (pathname === node.href || pathname.startsWith(node.href + '/')) {
          return true
        }
      }
      return false
    }
    for (const group of navigation) {
      const trail: string[] = []
      if (findTrail(group.items, trail)) {
        setOpenGroup(group.label)
        if (trail.length) setExpanded(prev => { const n = { ...prev }; trail.forEach(h => { n[h] = true }); return n })
        return
      }
    }
  }, [pathname])

  function toggleGroup(label: string) {
    setOpenGroup(prev => prev === label ? null : label)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Render recursivo de un nodo (soporta anidación arbitraria)
  function renderNode(node: NavNode, depth: number): React.ReactNode {
    if (!hasVisibleLeaf(node)) return null
    const Icon = node.icon
    const iconCls = depth === 0 ? 'w-4 h-4' : 'w-3.5 h-3.5'

    if (!node.children?.length) {
      const active = pathname === node.href || pathname.startsWith(node.href + '/')
      return (
        <li key={`${node.href}:${depth}`}>
          <Link
            href={node.href}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            <Icon className={cn('flex-shrink-0', iconCls)} />
            {node.name}
          </Link>
        </li>
      )
    }

    const isOpen = expanded[node.href] ?? false
    const active = nodeActive(node)
    return (
      <li key={`${node.href}:${depth}`}>
        <button
          onClick={() => setExpanded(prev => ({ ...prev, [node.href]: !isOpen }))}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
            active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          )}
        >
          <Icon className={cn('flex-shrink-0', iconCls)} />
          <span className="flex-1 text-left">{node.name}</span>
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
        </button>
        {isOpen && (
          <ul className="mt-0.5 ml-4 pl-3 border-l border-gray-800 space-y-0.5">
            {node.children.map(child => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-gray-950 text-gray-100 border-r border-gray-800">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
        <BrandLogo className="w-8 h-8" />
        <div>
          <p className="text-sm font-semibold text-white">BGU ERP</p>
          <p className="text-xs text-gray-400">Sistema Empresarial</p>
        </div>
      </div>

      {userName && (
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50">
          <p className="text-xs text-gray-500">Sesión activa</p>
          <p className="text-sm font-medium text-white truncate">
            {userName.split(' ')[0] !== userName
              ? `Hola, ${userName.split(' ')[0]}`
              : `Hola, ${userName}`}
          </p>
        </div>
      )}

      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {navigation.map((group) => {
          const visibleItems = group.items.filter(hasVisibleLeaf)
          if (visibleItems.length === 0) return null

          const isGroupOpen = openGroup === group.label
          const groupHasActive = visibleItems.some(nodeActive)

          return (
            <div key={group.label} className="border-b border-gray-800/60 last:border-0">
              <button
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  'flex items-center justify-between w-full px-3 py-2.5 text-xs font-semibold tracking-wider uppercase transition-colors',
                  groupHasActive && !isGroupOpen
                    ? 'text-blue-400'
                    : isGroupOpen
                      ? 'text-gray-200'
                      : 'text-gray-500 hover:text-gray-300'
                )}
              >
                {group.label}
                <ChevronDown className={cn(
                  'w-3 h-3 transition-transform duration-200',
                  isGroupOpen ? 'rotate-180' : 'rotate-0',
                  groupHasActive && !isGroupOpen ? 'text-blue-400' : 'text-gray-600'
                )} />
              </button>

              {isGroupOpen && (
                <ul className="pb-2 space-y-0.5">
                  {visibleItems.map(item => renderNode(item, 0))}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800 space-y-0.5">
        {superadmin && (
          <Link
            href="/student"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-blue-300 hover:bg-blue-900/30 hover:text-blue-200 transition-colors"
          >
            <GraduationCap className="w-4 h-4" />
            Ver portal estudiantil
          </Link>
        )}
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configuración
        </Link>
        <Link
          href="/update-password"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <KeyRound className="w-4 h-4" />
          Cambiar contraseña
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-red-900/40 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
