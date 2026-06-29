'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Headphones, DollarSign, Users, BarChart3,
  Share2, UserCog, Settings, LogOut, ChevronDown, ChevronRight,
  Building2, Bot, Shield, FileSignature, List, Plus, FileText,
  GraduationCap, CalendarDays, BookOpen, ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

type SubItem = { name: string; href: string; icon: React.ElementType }
type NavItem = { name: string; href: string; icon: React.ElementType; children?: SubItem[] }
type NavGroup = { label: string; items: NavItem[] }

const navigation: NavGroup[] = [
  {
    label: 'General',
    items: [{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Atención al Cliente',
    items: [
      { name: 'Tickets', href: '/desk', icon: Headphones },
      { name: 'Métricas', href: '/desk/metrics', icon: BarChart3 },
    ],
  },
  {
    label: 'Finanzas',
    items: [{ name: 'Contabilidad', href: '/finance', icon: DollarSign }],
  },
  {
    label: 'CRM',
    items: [{ name: 'Contactos', href: '/crm', icon: Users }],
  },
  {
    label: 'Redes Sociales',
    items: [{ name: 'Métricas', href: '/social', icon: Share2 }],
  },
  {
    label: 'Talento Humano',
    items: [
      { name: 'Colaboradores', href: '/hr', icon: UserCog },
      { name: 'KPIs & Bonos', href: '/kpis', icon: BarChart3 },
      {
        name: 'Contratos', href: '/contracts', icon: FileSignature,
        children: [
          { name: 'Lista', href: '/contracts', icon: List },
          { name: 'Nuevo', href: '/contracts/new', icon: Plus },
          { name: 'Plantillas', href: '/contracts/templates', icon: FileText },
        ],
      },
    ],
  },
  {
    label: 'Académico',
    items: [
      {
        name: 'Docentes', href: '/academic/faculty', icon: GraduationCap,
      },
      {
        name: 'Gestión académica', href: '/academic/years', icon: CalendarDays,
        children: [
          { name: 'Años y Semestres', href: '/academic/years', icon: CalendarDays },
          { name: 'Programas', href: '/academic/programs', icon: BookOpen },
          { name: 'Oferta', href: '/academic/offer', icon: ClipboardList },
        ],
      },
    ],
  },
  {
    label: 'IA',
    items: [
      { name: 'Sofia · Chat', href: '/chat', icon: Bot },
      { name: 'Sofia · Config', href: '/settings/sofia', icon: Bot },
    ],
  },
  {
    label: 'Administración',
    items: [{ name: 'Usuarios y permisos', href: '/settings/users', icon: Shield }],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  // Track which parent items are expanded
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Auto-expand if current path matches a child
  useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const group of navigation) {
      for (const item of group.items) {
        if (item.children?.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))) {
          next[item.href] = true
        }
      }
    }
    setExpanded(prev => ({ ...prev, ...next }))
  }, [pathname])

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

      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {navigation.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-xs font-semibold tracking-wider text-gray-500 uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
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
                            {item.children!.map(child => {
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
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configuración
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
