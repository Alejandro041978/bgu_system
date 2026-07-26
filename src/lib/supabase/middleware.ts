import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { pageKeyForPath } from '@/lib/permissions'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  // /portal es la entrada pública de estudiantes (mismo tratamiento que /login)
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/portal')
  const isApiRoute = pathname.startsWith('/api')
  const isPublicRoute = pathname.startsWith('/sign/') || pathname.startsWith('/auth/')
  const isStudentRoute = pathname.startsWith('/student')

  if (!user && !isAuthRoute && !isApiRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    // Will be redirected to correct home after role check below
    const url = request.nextUrl.clone()
    url.pathname = '/desk'
    return NextResponse.redirect(url)
  }

  // Auditoría "ver como colaborador": SOLO LECTURA. Mientras un superadmin real
  // tiene la suplantación activa (cookie imp_user), se bloquea toda escritura
  // (métodos no-GET) en /api, salvo el endpoint para salir de la vista.
  if (user && isApiRoute && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const impUser = request.cookies.get('imp_user')?.value
    if (impUser && pathname !== '/api/staff/impersonate-user') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = adminClient() as any
      const { data: realEmp } = await sb.from('hr_employees').select('role_id').eq('user_id', user.id).maybeSingle()
      if (!realEmp?.role_id) {
        return NextResponse.json({ error: 'Auditoría (ver como colaborador): sesión de solo lectura' }, { status: 403 })
      }
    }
  }

  // Enforce role permissions for authenticated users on app routes
  if (user && !isApiRoute && !isAuthRoute && !isPublicRoute) {
    const admin = adminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any

    // Check if user is staff (in hr_employees) — match by user_id OR email
    const { data: empById } = await sb
      .from('hr_employees')
      .select('id, role_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const { data: empByEmail } = !empById && user.email
      ? await sb.from('hr_employees').select('id, role_id').eq('email', user.email).maybeSingle()
      : { data: null }

    // If found by email but not by user_id, backfill user_id
    if (!empById && empByEmail) {
      await sb.from('hr_employees').update({ user_id: user.id }).eq('id', empByEmail.id)
    }

    const emp = empById ?? empByEmail

    // Only redirect to /student if explicitly registered as a student — superadmin and devs
    // are not in hr_employees but should NOT be treated as students
    const { data: student } = !emp && user.email
      ? await sb.from('academic_students').select('id').eq('email', user.email).eq('disabled', false).maybeSingle()
      : { data: null }

    const isStudent = !emp && !!student

    // Students: only allow /student/* routes
    if (isStudent) {
      if (!isStudentRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/student'
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    // Auditoría "ver como colaborador": un superadmin real (sin role_id) con la
    // cookie imp_user queda restringido a los permisos del ROL de ese colaborador.
    // Un colaborador normal no puede suplantar (su role_id manda).
    const realIsSuper = !emp?.role_id
    const impUser = request.cookies.get('imp_user')?.value || null
    let effectiveRoleId = emp?.role_id
    if (realIsSuper && impUser) {
      const { data: impEmp } = await sb.from('hr_employees').select('role_id').eq('user_id', impUser).maybeSingle()
      effectiveRoleId = impEmp?.role_id ?? null
    }

    // Staff: enforce role permissions per page
    const pageKey = pageKeyForPath(pathname)
    if (pageKey && effectiveRoleId) {
      const { data: perm } = await sb
        .from('role_permissions')
        .select('can_view')
        .eq('role_id', effectiveRoleId)
        .eq('page_key', pageKey)
        .maybeSingle()

      if (!perm?.can_view) {
        if (pathname === '/desk' || pathname === '/dashboard') {
          return supabaseResponse
        }
        const url = request.nextUrl.clone()
        url.pathname = '/desk'
        url.search = '?forbidden=1'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
