import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { getAccessToken, googleConfigured } from '@/lib/google-workspace'

export const revalidate = 0
export const maxDuration = 60

// GET ?email=alguien@blackwell.pro → diagnóstico de la conexión con Google.
//
// Existe porque un 403 "Not Authorized to access this resource/api" no dice si
// el problema es el scope del token, el rol del administrador o la unidad
// organizativa. Esto responde las tres con datos, no con suposiciones.
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (!googleConfigured()) return NextResponse.json({ error: 'Google no configurado' }, { status: 503 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = { org_unit_configurada: process.env.STUDENT_EMAIL_ORG_UNIT || '/blackwell.pro' }

  let token: string
  try {
    token = await getAccessToken()
  } catch (e) {
    return NextResponse.json({ ...out, error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }

  // 1) ¿Qué permisos tiene REALMENTE el token? El scope que pide la pantalla de
  // autorización y el que quedó concedido pueden no coincidir: si el refresh
  // token se generó en otra ocasión, arrastra los permisos de entonces.
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
    const d = await r.json()
    out.scopes_concedidos = typeof d.scope === 'string' ? d.scope.split(' ') : d.scope ?? null
    out.puede_escribir_usuarios = typeof d.scope === 'string'
      && d.scope.split(' ').includes('https://www.googleapis.com/auth/admin.directory.user')
    if (d.email) out.cuenta_autorizada = d.email
  } catch (e) {
    out.tokeninfo_error = e instanceof Error ? e.message : String(e)
  }

  // 2) La cuenta objetivo: en qué unidad organizativa está y si es admin (a un
  // administrador delegado no se le puede tocar la contraseña).
  const email = req.nextUrl.searchParams.get('email')
  if (email) {
    const r = await fetch(`https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = await r.json().catch(() => ({}))
    out.lectura = { http: r.status, ok: r.ok }
    if (r.ok) {
      out.usuario = {
        primaryEmail: d.primaryEmail, orgUnitPath: d.orgUnitPath,
        isAdmin: d.isAdmin, isDelegatedAdmin: d.isDelegatedAdmin,
        suspended: d.suspended, lastLoginTime: d.lastLoginTime,
        changePasswordAtNextLogin: d.changePasswordAtNextLogin,
      }
      // 3) Escritura SIN tocar la contraseña: separa "no puedo actualizar nada"
      // de "no puedo cambiar contraseñas". Reescribe el mismo valor que ya
      // tiene, así que no cambia nada aunque funcione.
      const w = await fetch(`https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ changePasswordAtNextLogin: !!d.changePasswordAtNextLogin }),
      })
      const wd = await w.json().catch(() => ({}))
      out.escritura_sin_password = { http: w.status, ok: w.ok, mensaje: wd.error?.message ?? null }
      out.interpretacion = w.ok
        ? 'Puede actualizar usuarios pero NO cambiar contraseñas → falta el privilegio «Restablecer contraseña» en el rol.'
        : 'No puede actualizar NADA → el rol no tiene privilegios de escritura sobre esta unidad organizativa, o la asignación del rol no cubre esta UO.'
    } else {
      out.lectura_error = d.error?.message ?? null
    }
  }

  return NextResponse.json(out)
}
