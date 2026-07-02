import { Topbar } from '@/components/layout/topbar'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Link from 'next/link'
import {
  Users, GraduationCap, Handshake, BookOpen,
  FileSignature, Headphones, ArrowRight,
} from 'lucide-react'

export const revalidate = 0

const COLOR_MAP: Record<string, { bg: string; icon: string; border: string; accent: string }> = {
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   border: 'border-blue-100',   accent: 'text-blue-700' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', border: 'border-purple-100', accent: 'text-purple-700' },
  green:  { bg: 'bg-green-50',  icon: 'text-green-600',  border: 'border-green-100',  accent: 'text-green-700' },
  amber:  { bg: 'bg-amber-50',  icon: 'text-amber-600',  border: 'border-amber-100',  accent: 'text-amber-700' },
  indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-100', accent: 'text-indigo-700' },
  teal:   { bg: 'bg-teal-50',   icon: 'text-teal-600',   border: 'border-teal-100',   accent: 'text-teal-700' },
}

const db = () => createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function DashboardPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = db() as any

  const [
    { count: colaboradores },
    { data: facultyRows },
    { count: convenios },
    { count: capacitaciones },
    { count: plantillas },
    { count: ticketsAtendidos },
  ] = await Promise.all([
    supabase.from('hr_employees').select('id', { count: 'exact', head: true }),
    supabase.from('faculty_assignments').select('employee_id'),
    supabase.from('convenios').select('id', { count: 'exact', head: true }),
    supabase.from('capacitaciones').select('id', { count: 'exact', head: true }),
    supabase.from('contract_templates').select('id', { count: 'exact', head: true }),
    supabase.from('desk_tickets').select('id', { count: 'exact', head: true }).eq('status_type', 'closed'),
  ])

  const profesores = new Set((facultyRows ?? []).map((r: { employee_id: string }) => r.employee_id)).size

  const stats = [
    {
      label: 'Colaboradores',
      sublabel: 'Personal registrado en RRHH',
      value: colaboradores ?? 0,
      icon: Users,
      color: 'blue',
      href: '/hr',
    },
    {
      label: 'Profesores',
      sublabel: 'Docentes con asignaciones',
      value: profesores,
      icon: GraduationCap,
      color: 'purple',
      href: '/academic/faculty',
    },
    {
      label: 'Convenios',
      sublabel: 'Alianzas institucionales',
      value: convenios ?? 0,
      icon: Handshake,
      color: 'green',
      href: '/convenios',
    },
    {
      label: 'Capacitaciones',
      sublabel: 'Programas registrados',
      value: capacitaciones ?? 0,
      icon: BookOpen,
      color: 'amber',
      href: '/hr/capacitaciones',
    },
    {
      label: 'Plantillas de contrato',
      sublabel: 'Formatos disponibles',
      value: plantillas ?? 0,
      icon: FileSignature,
      color: 'indigo',
      href: '/contracts/templates',
    },
    {
      label: 'Tickets atendidos',
      sublabel: 'Tickets cerrados en Zoho Desk',
      value: ticketsAtendidos ?? 0,
      icon: Headphones,
      color: 'teal',
      href: '/desk',
    },
  ]

  return (
    <>
      <Topbar title="Dashboard" subtitle="Resumen general del sistema" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {stats.map((stat) => {
            const c = COLOR_MAP[stat.color]
            const Icon = stat.icon
            return (
              <Link
                key={stat.label}
                href={stat.href}
                className={`group flex items-start gap-4 bg-white rounded-xl border ${c.border} p-5 hover:shadow-md transition-shadow`}
              >
                <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${c.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-bold text-gray-900 leading-none">
                    {stat.value.toLocaleString('es-PE')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-700">{stat.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{stat.sublabel}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0 mt-1" />
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
