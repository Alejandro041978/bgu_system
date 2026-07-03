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
  const isPublicRoute = pathname.startsWith('/sign/')

  if (!user && !isAuthRoute && !isApiRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/desk'
    return NextResponse.redirect(url)
  }

  // Enforce role permissions for authenticated users on app routes
  if (user && !isApiRoute && !isAuthRoute && !isPublicRoute) {
    const pageKey = pageKeyForPath(pathname)
    if (pageKey) {
      const admin = adminClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = admin as any

      // Get employee's role
      const { data: emp } = await sb
        .from('hr_employees')
        .select('role_id')
        .eq('user_id', user.id)
        .single()

      // No employee record or no role = superadmin, allow all
      if (emp?.role_id) {
        const { data: perm } = await sb
          .from('role_permissions')
          .select('can_view')
          .eq('role_id', emp.role_id)
          .eq('page_key', pageKey)
          .maybeSingle()

        // No row in role_permissions = not granted → redirect to first allowed page or desk
        if (!perm?.can_view) {
          // Avoid redirect loop: if we're already on the fallback, just allow it
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
  }

  return supabaseResponse
}
