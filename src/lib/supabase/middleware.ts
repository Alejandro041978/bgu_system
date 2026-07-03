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
  const isAuthRoute = pathname.startsWith('/login')
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

    // If found by email but not by user_id, backfill user_id so future lookups are fast
    if (!empById && empByEmail) {
      await sb.from('hr_employees').update({ user_id: user.id }).eq('id', empByEmail.id)
    }

    const emp = empById ?? empByEmail
    const isStudent = !emp

    // Students: only allow /student/* routes
    if (isStudent) {
      if (!isStudentRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/student'
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    // Staff: enforce role permissions per page
    const pageKey = pageKeyForPath(pathname)
    if (pageKey && emp?.role_id) {
      const { data: perm } = await sb
        .from('role_permissions')
        .select('can_view')
        .eq('role_id', emp.role_id)
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
