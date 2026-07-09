'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Headphones, DollarSign, Users, BarChart3,
  Share2, UserCog, Settings, LogOut, ChevronDown, ChevronRight,
  Building2, Bot, Shield, FileSignature, List, Plus, FileText,
  GraduationCap, CalendarDays, BookOpen, ClipboardList, Target,
  TrendingUp, Gauge, Handshake, Award, MessageSquare, KeyRound, Calculator, FileCheck, Layers, Wallet, Tag, Receipt, UserCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { usePermissions } from '@/hooks/use-permissions'

type SubItem = { name: string; href: string; icon: React.ElementType; pageKey?: string }
type NavItem = { name: string; href: string; icon: React.ElementType; pageKey?: string; children?: SubItem[] }
type NavGroup = { label: string; items: NavItem[] }

const navigation: NavGroup[] = [
  {
    label: 'General',
    items: [{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, pageKey: 'dashboard' }],
  },
  {
    label: 'Atención al Cliente',
    items: [
      { name: 'Tickets', href: '/desk', icon: Headphones, pageKey: 'desk' },
      { name: 'Buzón WhatsApp', href: '/inbox', icon: MessageSquare, pageKey: 'inbox' },
      { name: 'Helpdesk · Skills', href: '/helpdesk/skills', icon: UserCog, pageKey: 'helpdesk_skills' },
      { name: 'Métricas', href: '/desk/metrics', icon: BarChart3, pageKey: 'desk_metrics' },
    ],
  },
  {
    label: 'Finanzas',
    items: [{ name: 'Contabilidad', href: '/finance', icon: DollarSign, pageKey: 'finance' }],
  },
  {
    label: 'Admisión',
    items: [
      { name: 'Contactos', href: '/crm', icon: Users, pageKey: 'crm' },
      { name: 'Convenios', href: '/convenios', icon: Handshake, pageKey: 'convenios' },
      { name: 'Matrículas', href: '/admision/matriculas', icon: GraduationCap, pageKey: 'admision_matriculas' },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { name: 'Prospectos', href: '/ventas/prospectos', icon: TrendingUp, pageKey: 'sales_prospectos' },
    ],
  },
  {
    label: 'Redes Sociales',
    items: [{ name: 'Métricas', href: '/social', icon: Share2, pageKey: 'social' }],
  },
  {
    label: 'Talento Humano',
    items: [
      { name: 'Colaboradores', href: '/hr', icon: UserCog, pageKey: 'hr' },
      { name: 'KPIs & Bonos', href: '/kpis', icon: BarChart3, pageKey: 'kpis' },
      {
        name: 'Capacitaciones', href: '/hr/capacitaciones', icon: GraduationCap, pageKey: 'hr_capacitaciones',
        children: [
          { name: 'Registro', href: '/hr/capacitaciones', icon: ClipboardList, pageKey: 'hr_capacitaciones' },
          { name: 'Participantes', href: '/hr/capacitaciones/participantes', icon: Users, pageKey: 'hr_capacitacion_participantes' },
        ],
      },
      {
        name: 'Contratos', href: '/contracts', icon: FileSignature, pageKey: 'contracts',
        children: [
          { name: 'Lista', href: '/contracts', icon: List, pageKey: 'contracts' },
          { name: 'Nuevo', href: '/contracts/new', icon: Plus, pageKey: 'contracts_new' },
          { name: 'Plantillas', href: '/contracts/templates', icon: FileText, pageKey: 'contracts_templates' },
        ],
      },
    ],
  },
  {
    label: 'Académico',
    items: [
      { name: 'Docentes', href: '/academic/faculty', icon: GraduationCap, pageKey: 'academic_faculty' },
      {
        name: 'Calificaciones', href: '/academic/grades', icon: Award, pageKey: 'academic_grades',
        children: [
          { name: 'Notas', href: '/academic/grades', icon: Award, pageKey: 'academic_grades' },
          { name: 'Acta Personal', href: '/academic/acta', icon: FileText, pageKey: 'academic_acta' },
          { name: 'Acta Detallada', href: '/academic/acta-detalle', icon: FileText, pageKey: 'academic_acta_detail' },
        ],
      },
      { name: 'Estado de Cuenta', href: '/academic/account', icon: Wallet, pageKey: 'academic_account' },
      { name: 'Conceptos de Cuenta', href: '/academic/concepts', icon: Tag, pageKey: 'academic_concepts' },
      { name: 'Plantillas de Facturación', href: '/academic/billing-plans', icon: Receipt, pageKey: 'academic_billing_plans' },
      { name: 'Convocatorias', href: '/academic/convocatorias', icon: ClipboardList, pageKey: 'academic_convocatorias' },
      {
        name: 'Convalidaciones', href: '/academic/transfer-credits', icon: FileCheck, pageKey: 'academic_transfer_credits',
        children: [
          { name: 'Individual', href: '/academic/transfer-credits', icon: FileCheck, pageKey: 'academic_transfer_credits' },
          { name: 'Esquemas masivos', href: '/academic/transfer-schemes', icon: Layers, pageKey: 'academic_transfer_schemes' },
          { name: 'Validación de asignaturas', href: '/academic/validations', icon: FileCheck, pageKey: 'academic_validations' },
          { name: 'Escalas de conversión', href: '/academic/grade-scales', icon: Calculator, pageKey: 'academic_grade_scales' },
        ],
      },
      { name: 'Credencial', href: '/academic/credentials', icon: Shield, pageKey: 'academic_credentials' },
      {
        name: 'Gestión académica', href: '/academic/years', icon: CalendarDays, pageKey: 'academic_years',
        children: [
          { name: 'Años y Semestres', href: '/academic/years', icon: CalendarDays, pageKey: 'academic_years' },
          { name: 'Programas', href: '/academic/programs', icon: BookOpen, pageKey: 'academic_programs' },
          { name: 'Oferta', href: '/academic/offer', icon: ClipboardList, pageKey: 'academic_offer' },
          { name: 'Grupos', href: '/academic/groups', icon: Users, pageKey: 'academic_groups' },
      { name: 'Asignación Docente', href: '/academic/teaching-assignments', icon: UserCheck, pageKey: 'academic_teaching' },
          { name: 'Cronogramas', href: '/academic/schedules', icon: CalendarDays, pageKey: 'academic_schedules' },
        ],
      },
    ],
  },
  {
    label: 'Registrar',
    items: [
      { name: 'Formatos', href: '/registrar/formatos', icon: Award, pageKey: 'registrar_formatos' },
      { name: 'Tipos de Documento', href: '/registrar/document-types', icon: FileText, pageKey: 'registrar_document_types' },
      { name: 'Solicitudes', href: '/registrar/requests', icon: ClipboardList, pageKey: 'registrar_requests' },
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
    label: 'IA',
    items: [
      { name: 'Sofia · Chat', href: '/chat', icon: Bot, pageKey: 'chat' },
      { name: 'Bots · Configuración', href: '/settings/sofia', icon: Bot, pageKey: 'settings_sofia' },
      { name: 'Bots · Supervisor', href: '/ia/sofia-supervisor', icon: Shield, pageKey: 'sofia_supervisor' },
    ],
  },
  {
    label: 'Administración',
    items: [{ name: 'Usuarios y permisos', href: '/settings/users', icon: Shield, pageKey: 'settings_users' }],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { canView, superadmin } = usePermissions()
  const [userName, setUserName] = useState<string | null>(null)

  // One group open at a time (accordion)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  // Sub-item expansion within a group
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      const name = user?.user_metadata?.full_name as string | undefined
      setUserName(name ?? user?.email ?? null)
    })
  }, [])

  // Auto-open the group and parent item that matches the current path
  useEffect(() => {
    for (const group of navigation) {
      for (const item of group.items) {
        const directMatch = !item.children && (pathname === item.href || pathname.startsWith(item.href + '/'))
        const childMatch = item.children?.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
        if (directMatch || childMatch) {
          setOpenGroup(group.label)
          if (childMatch) setExpanded(prev => ({ ...prev, [item.href]: true }))
          return
        }
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

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-gray-950 text-gray-100 border-r border-gray-800">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600">
          <Building2 className="w-5 h-5 text-white" />
        </div>
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
          const visibleItems = group.items.filter(item => {
            if (item.children) return item.children.some(c => !c.pageKey || canView(c.pageKey))
            return !item.pageKey || canView(item.pageKey)
          })
          if (visibleItems.length === 0) return null

          const isGroupOpen = openGroup === group.label
          const groupHasActive = visibleItems.some(item => {
            if (item.children) return item.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
            return pathname === item.href || pathname.startsWith(item.href + '/')
          })

          return (
            <div key={group.label} className="border-b border-gray-800/60 last:border-0">
              {/* Group header — clickable accordion trigger */}
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

              {/* Group items — only visible when open */}
              {isGroupOpen && (
                <ul className="pb-2 space-y-0.5">
                  {visibleItems.map((item) => {
                    const hasChildren = !!item.children?.length
                    const isChildActive = hasChildren && item.children!.some(
                      c => pathname === c.href || (c.href !== item.href && pathname.startsWith(c.href))
                    )
                    const isActive = !hasChildren && (pathname === item.href || pathname.startsWith(item.href + '/'))
                    const isOpen = expanded[item.href] ?? false

                    return (
                      <li key={item.href}>
                        {hasChildren ? (
                          <>
                            <button
                              onClick={() => setExpanded(prev => ({ ...prev, [item.href]: !isOpen }))}
                              className={cn(
                                'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                                isChildActive
                                  ? 'bg-gray-800 text-white'
                                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                              )}
                            >
                              <item.icon className="w-4 h-4 flex-shrink-0" />
                              <span className="flex-1 text-left">{item.name}</span>
                              {isOpen
                                ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                                : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                            </button>
                            {isOpen && (
                              <ul className="mt-0.5 ml-4 pl-3 border-l border-gray-800 space-y-0.5">
                                {item.children!.filter(c => !c.pageKey || canView(c.pageKey)).map(child => {
                                  const childActive = pathname === child.href ||
                                    (child.href !== item.href && pathname.startsWith(child.href + '/'))
                                  return (
                                    <li key={child.href}>
                                      <Link
                                        href={child.href}
                                        className={cn(
                                          'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                                          childActive
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                        )}
                                      >
                                        <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                                        {child.name}
                                      </Link>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </>
                        ) : (
                          <Link
                            href={item.href}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                              isActive
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                            )}
                          >
                            <item.icon className="w-4 h-4 flex-shrink-0" />
                            {item.name}
                          </Link>
                        )}
                      </li>
                    )
                  })}
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
