import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CalendarDays, MessageCircle, LogOut, Award, ArrowLeft, Wallet, FileText } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import Link from 'next/link'
import { getEffectiveStudent, isSuperadmin } from '@/lib/student-identity'
import { ImpersonateBar } from '@/components/student/impersonate-bar'
import { PortalHeartbeat } from '@/components/student/portal-heartbeat'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const student = await getEffectiveStudent({ id: user.id, email: user.email })
  const isRealStudent = !!student && !student.impersonating
  const impersonating = !!student && student.impersonating
  const superadmin = await isSuperadmin(user.id)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Latido de presencia (solo cuenta si la sesión es de un estudiante real) */}
      {isRealStudent && <PortalHeartbeat />}
      {/* Barra "Entrar por" (superadmin busca/cambia el estudiante a visualizar) */}
      {superadmin && <ImpersonateBar impersonating={impersonating} currentName={student?.name ?? null} />}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BrandLogo className="w-8 h-8" />
          <div>
            <p className="text-sm font-bold text-gray-900">BGU ERP</p>
            <p className="text-xs text-gray-500">Portal Estudiantil</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isRealStudent && (
            <Link href="/desk" className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Panel administrativo
            </Link>
          )}
          <p className="text-xs text-gray-500 hidden sm:block">{user.email}</p>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
              <LogOut className="w-3.5 h-3.5" /> Salir
            </button>
          </form>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-4">
        <div className="flex gap-1">
          <Link href="/student" className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-500 transition-colors">
            <CalendarDays className="w-4 h-4" /> Cronogramas
          </Link>
          <Link href="/student/grades" className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-500 transition-colors">
            <Award className="w-4 h-4" /> Mis Notas
          </Link>
          <Link href="/student/account" className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-500 transition-colors">
            <Wallet className="w-4 h-4" /> Estado de Cuenta
          </Link>
          <Link href="/student/documents" className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-500 transition-colors">
            <FileText className="w-4 h-4" /> Documentos
          </Link>
          <Link href="/student/examenes" className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-500 transition-colors">
            <Award className="w-4 h-4" /> Exámenes
          </Link>
          <Link href="/student/sofia" className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-500 transition-colors">
            <MessageCircle className="w-4 h-4" /> Sofia · Chat
          </Link>
        </div>
      </nav>

      <main className="flex-1 p-4 sm:p-6">
        {children}
      </main>
    </div>
  )
}
