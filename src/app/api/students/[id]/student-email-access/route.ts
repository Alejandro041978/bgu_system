import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import {
  googleConfigured, langFor, getStudentAccountState, resetStudentPassword, notifyStudentEmail,
} from '@/lib/google-workspace'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function guard() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  if (!googleConfigured()) {
    return { error: NextResponse.json({ error: 'Google Workspace no está configurado (faltan las variables GOOGLE_OAUTH_*)' }, { status: 503 }) }
  }
  return { user }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadStudent(sb: any, id: string) {
  const { data } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, email, email_alt, country').eq('id', id).maybeSingle()
  return data
}

// GET → estado de la cuenta @blackwell.pro: si ya la usó, si tiene datos de
// recuperación y si sigue con la contraseña temporal.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await params
  const s = await loadStudent(db(), id)
  if (!s) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })
  if (!s.email_alt) return NextResponse.json({ error: 'El estudiante no tiene correo institucional' }, { status: 409 })

  try {
    const st = await getStudentAccountState(s.email_alt)
    return NextResponse.json({ ...st, email: s.email_alt, personal_email: s.email ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}

// POST { accion?: 'reenviar' | 'restablecer' } → emite una contraseña temporal
// nueva y la envía al correo personal.
//
// "Reenviar el correo original" no existe: la contraseña se genera al crear la
// cuenta y no se guarda en ninguna parte. Las dos acciones hacen lo mismo por
// dentro; lo que cambia es a quién se le permite.
//
//   reenviar    → solo si NUNCA entró. Es el caso inocuo: no hay contraseña
//                 propia que pisar, así que no se pide confirmación.
//   restablecer → también si ya entró. Le quita la contraseña que estaba
//                 usando, y por eso hay que pedirlo explícitamente: es la
//                 respuesta a "olvidé mi contraseña y no puedo recuperarla".
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await params
  const body = await req.json().catch(() => null) as { accion?: string } | null
  const restablecer = body?.accion === 'restablecer'
  const sb = db()
  const s = await loadStudent(sb, id)
  if (!s) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })
  if (!s.email_alt) return NextResponse.json({ error: 'El estudiante no tiene correo institucional' }, { status: 409 })
  if (!s.email) {
    return NextResponse.json({ error: 'El estudiante no tiene correo personal registrado: no hay a dónde enviarlo. Regístralo primero o entrégale las credenciales por otro canal.' }, { status: 409 })
  }

  let st
  try {
    st = await getStudentAccountState(s.email_alt)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
  if (!st.exists) return NextResponse.json({ error: `La cuenta ${s.email_alt} no existe en Google Workspace` }, { status: 409 })
  if (st.everLoggedIn && !restablecer) {
    return NextResponse.json({
      error: `El estudiante ya usó su cuenta (último acceso: ${new Date(st.lastLoginTime!).toLocaleString('es-PE')}). Reenviar generaría una contraseña nueva y le quitaría el acceso que ya tiene.`,
      ever_logged_in: true, last_login_time: st.lastLoginTime,
    }, { status: 409 })
  }

  try {
    const created = await resetStudentPassword(s.email_alt)
    await notifyStudentEmail(
      s.email, [s.first_name, s.last_name].filter(Boolean).join(' '),
      created, langFor(s.country), restablecer ? 'reset' : 'alta',
    )
    return NextResponse.json({ ok: true, sent_to: s.email, email: s.email_alt, restablecida: restablecer })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
