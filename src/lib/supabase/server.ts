import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

// Auditoría "ver como colaborador": si un SUPERADMIN real activó la cookie
// imp_user, se inyecta la identidad de ese colaborador en auth.getUser(), de modo
// que TODO el ERP (permisos, "Mías", tickets, dashboards) lo vea como esa persona.
// Solo lectura: las escrituras se bloquean en el middleware. Pasar
// { impersonate: false } para obtener SIEMPRE el usuario real (endpoints de audit).
export async function createClient(opts?: { impersonate?: boolean }) {
  const cookieStore = await cookies()

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  const impUser = cookieStore.get('imp_user')?.value
  if (opts?.impersonate === false || !impUser) return client

  const realGetUser = client.auth.getUser.bind(client.auth)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(client.auth as any).getUser = async (...args: any[]) => {
    const res = await realGetUser(...args)
    const real = res.data?.user
    if (!real) return res
    try {
      const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      // Solo un superadmin real (sin role_id) puede suplantar
      const { data: realEmp } = await admin.from('hr_employees').select('role_id').eq('user_id', real.id).maybeSingle()
      if (realEmp?.role_id) return res
      // El colaborador suplantado debe ser staff con cuenta
      const { data: target } = await admin.from('hr_employees').select('user_id, email').eq('user_id', impUser).maybeSingle()
      if (!target?.user_id) return res
      return { data: { user: { ...real, id: impUser, email: target.email ?? real.email } }, error: null } as typeof res
    } catch { return res }
  }
  return client
}

export async function createServiceClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
