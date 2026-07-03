import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Building2, CalendarDays, MessageCircle, LogOut } from 'lucide-react'
import Link from 'next/link'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">BGU ERP</p>
            <p className="text-xs text-gray-500">Portal Estudiantil</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          <Link
            href="/student"
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-500 transition-colors"
          >
            <CalendarDays className="w-4 h-4" /> Cronogramas
          </Link>
          <Link
            href="/student/sofia"
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-500 transition-colors"
          >
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
