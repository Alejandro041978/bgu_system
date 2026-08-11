import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { pageKeyForPath, pageKeyForApi, accionDeMetodo, apiExentaDePermiso, type AccionPermiso } from '@/lib/permissions'
import { findStudentByLoginEmail } from '@/lib/student-lookup'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COLUMNA: Record<AccionPermiso, 'can_view' | 'can_edit' | 'can_delete'> = {
  ver: 'can_view', editar: 'can_edit', borrar: 'can_delete',
}

// Devuelve una respuesta 403 solo en modo estricto; en auditoría devuelve null
// (deja pasar) después de anotar lo que habría bloqueado.
async function evaluarPermisoApi(
  request: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any,
  pathname: string,
): Promise<NextResponse | null> {
  const estricto = process.env.PERMISOS_MODO === 'estricto'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = adminClient() as any
  try {
    const { data: emp } = await sb.from('hr_employees')
      .select('id, role_id').eq('user_id', user.id).maybeSingle()
    if (!emp) return null                       // no es colaborador: lo resuelve guardStaff
    // Superadmin real (sin rol). Si está viendo como otro, manda el rol de ese.
    const impUser = request.cookies.get('imp_user')?.value || null
    let roleId: string | null = emp.role_id ?? null
    if (!roleId && impUser) {
      const { data: impEmp } = await sb.from('hr_employees').select('role_id').eq('user_id', impUser).maybeSingle()
      roleId = impEmp?.role_id ?? null
    }
    if (!roleId) return null                    // superadmin: pasa

    const pageKey = pageKeyForApi(pathname)
    // Ruta sin mapear: no se inventa una exigencia. El reporte de auditoría las
    // lista para cerrarlas, en vez de negar por lo que no sabemos.
    if (!pageKey) return null

    const accion = accionDeMetodo(request.method)
    const { data: perm } = await sb.from('role_permissions')
      .select('can_view, can_edit, can_delete')
      .eq('role_id', roleId).eq('page_key', pageKey).maybeSingle()

    // can_delete puede no existir todavía (SQL sin correr): mientras tanto,
    // borrar se comporta como editar en vez de bloquear a todo el mundo.
    const permitido = accion === 'borrar'
      ? (perm?.can_delete ?? perm?.can_edit ?? false)
      : (perm?.[COLUMNA[accion]] ?? false)
    if (permitido) return null

    const { data: rol } = await sb.from('roles').select('name').eq('id', roleId).maybeSingle()
    await sb.from('permission_audit').insert({
      user_id: user.id, email: user.email ?? null,
      role_id: roleId, role_name: rol?.name ?? null,
      page_key: pageKey, accion, metodo: request.method, ruta: pathname,
      bloqueado: estricto,
    }).then(() => null, () => null)

    if (!estricto) return null
    return NextResponse.json({
      error: `Tu rol no tiene permiso para ${accion} en esta sección`,
      page_key: pageKey, accion,
    }, { status: 403 })
  } catch {
    // Un fallo del guard no puede tumbar el ERP. En auditoría deja pasar; en
    // estricto también, porque negar por un error de lectura sería peor: se
    // vería como "el sistema no funciona" y no como "no tienes permiso".
    return null
  }
}

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
  // /form/* son formularios de cara al estudiante SIN sesión: quien viene a
  // recuperar su correo institucional no puede iniciar sesión, que es
  // precisamente su problema. OJO al añadir páginas aquí: todo lo que cuelgue
  // de /form nace público.
  const isPublicRoute = pathname.startsWith('/sign/') || pathname.startsWith('/auth/') || pathname.startsWith('/form/')
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

  // ── Permiso de página en las rutas de API ────────────────────────────────
  //
  // Hasta aquí el ERP solo exigía permiso para VER una página. Las 215 rutas de
  // escritura no comprobaban nada: bastaba con ser colaborador, así que la
  // casilla "Editar" del configurador no hacía nada en ningún sitio. Ocultar
  // botones no lo arregla —el endpoint sigue respondiendo—, por eso se exige
  // aquí, que es por donde pasan todas.
  //
  // MODO AUDITORÍA (por defecto): no bloquea, registra. La configuración actual
  // nunca se sintió y no describe cómo trabaja la gente —hay roles con 69
  // páginas visibles y cero editables cuya gente edita a diario—, así que
  // bloquear de golpe apagaría media operación. Primero se anota qué se habría
  // bloqueado, se corrigen los roles con esa lista, y luego se pone estricto
  // con PERMISOS_MODO=estricto.
  if (user && isApiRoute && !apiExentaDePermiso(pathname)) {
    const veredicto = await evaluarPermisoApi(request, user, pathname)
    if (veredicto) return veredicto
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
    // are not in hr_employees but should NOT be treated as students.
    //
    // Se busca por el correo personal Y por el institucional (@blackwell.pro).
    // Buscar solo por el personal abría el ERP entero a 40 estudiantes que solo
    // tienen el institucional: no se les reconocía como estudiantes, y como
    // tampoco están en hr_employees, más abajo `realIsSuper` los daba por
    // superadministradores.
    const student = !emp ? await findStudentByLoginEmail(sb, user.email) : null

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
