import { Sidebar } from '@/components/layout/sidebar'
import { createClient } from '@/lib/supabase/server'
import { esPersonal } from '@/lib/api-guard'
import { redirect } from 'next/navigation'

// ---------------------------------------------------------------------------
// Este layout envuelve TODO el ERP de gestión. Hasta hoy solo preguntaba si
// había sesión, y con eso cualquiera de las 635 cuentas —601 de ellas de
// estudiantes— abría el portal del personal escribiendo /desk en la barra de
// direcciones. Lo que se veía dentro dependía de que cada endpoint se acordara
// de comprobarlo por su cuenta.
//
// Ahora la puerta pregunta lo mismo que las rutas: ¿es personal? Y quien no lo
// sea va a su portal, no a una pantalla de error: los estudiantes llegan aquí
// por un enlace de acceso cuyo destino por omisión es /desk.
// ---------------------------------------------------------------------------
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }
  if (!(await esPersonal(user))) {
    redirect('/student')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
