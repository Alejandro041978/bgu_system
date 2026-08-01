import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { moodleConfigured, getUserByEmail, getUserByIdnumber } from '@/lib/moodle'
import { crearCuentaMoodle, renovarContrasenaMoodle, notificarCuentaMoodle } from '@/lib/moodle-account'
import { getStudentAccountState } from '@/lib/google-workspace'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// ---------------------------------------------------------------------------
// Los tres casos, tal como los definió Académica:
//
//   a) Con derecho a correo estudiantil → la cuenta Moodle nace con el
//      @blackwell.pro, y exige que ese correo YA exista.
//   b) Sin derecho, programa en nuestro campus → con el correo personal.
//   c) Sin derecho, programa en campus externo → no se crea cuenta.
//
// El orden importa y es consecutivo: primero el correo estudiantil, después
// Moodle. Por eso (a) no cae al personal si falta el institucional — se
// detiene y lo dice.
// ---------------------------------------------------------------------------
type Caso = 'a' | 'b' | 'c'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clasificar(sb: any, studentId: string): Promise<{ caso: Caso; motivo: string }> {
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('academic_programs(name, partner_campus, category:academic_programs_category(name))')
    .eq('student_id', studentId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progs = ((enr ?? []) as any[]).map(e => e.academic_programs).filter(Boolean)

  if (progs.some(p => /bachelor|master|doctor/i.test(p?.category?.name ?? ''))) {
    return { caso: 'a', motivo: 'Su programa da derecho a correo estudiantil' }
  }
  // Basta un programa en nuestro campus para que le corresponda cuenta.
  if (progs.some(p => !p?.partner_campus)) {
    return { caso: 'b', motivo: 'Programa dictado en nuestro campus, sin derecho a correo estudiantil' }
  }
  return { caso: 'c', motivo: 'Su programa se dicta en un campus externo' }
}

// GET ?student_id= → estado, sin tocar nada
export async function GET(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Falta student_id' }, { status: 400 })
  const sb = db()

  const { data: s } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, email, email_alt, external_id, moodle_user_id, moodle_credentials_sent_at, moodle_credentials_sent_to')
    .eq('id', studentId).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  const { caso, motivo } = await clasificar(sb, studentId)
  const usuario = caso === 'a' ? s.email_alt : s.email

  return NextResponse.json({
    caso, motivo,
    corresponde: caso !== 'c',
    usuario,
    falta_correo_estudiantil: caso === 'a' && !s.email_alt,
    tiene_cuenta: !!s.moodle_user_id,
    moodle_user_id: s.moodle_user_id ?? null,
    credenciales_enviadas_a: s.moodle_credentials_sent_to ?? null,
    credenciales_enviadas_el: s.moodle_credentials_sent_at ?? null,
    correo_personal: s.email ?? null,
    correo_estudiantil: s.email_alt ?? null,
  })
}

// POST { student_id, accion: 'crear' | 'reenviar' }
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const b = await req.json().catch(() => null) as { student_id?: string; accion?: string } | null
  if (!b?.student_id || !['crear', 'reenviar'].includes(b.accion ?? '')) {
    return NextResponse.json({ error: 'Falta student_id o acción' }, { status: 400 })
  }
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no está configurado' }, { status: 400 })

  const sb = db()
  const { data: s } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, email, email_alt, external_id, moodle_user_id, country')
    .eq('id', b.student_id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  const { caso, motivo } = await clasificar(sb, b.student_id)
  if (caso === 'c') return NextResponse.json({ error: `No corresponde cuenta de campus: ${motivo}` }, { status: 400 })

  const usuario = caso === 'a' ? s.email_alt : s.email
  if (caso === 'a' && !s.email_alt) {
    return NextResponse.json({ error: 'Primero hay que crear su correo estudiantil (@blackwell.pro): la cuenta de campus debe nacer con él' }, { status: 400 })
  }
  if (!usuario) return NextResponse.json({ error: 'El estudiante no tiene correo con el que crear la cuenta' }, { status: 400 })

  const nombre = [s.first_name, s.last_name].filter(Boolean).join(' ') || 'estudiante'
  let moodleId = s.moodle_user_id ? Number(s.moodle_user_id) : null
  let password: string

  try {
    if (b.accion === 'crear') {
      // Puede existir ya en el campus aunque el ERP no lo sepa: la migración de
      // SystemActiva dejó cuentas sin registrar. Se busca antes de crear para
      // no duplicar.
      if (!moodleId && s.external_id) moodleId = (await getUserByIdnumber(s.external_id))?.id ?? null
      if (!moodleId) moodleId = (await getUserByEmail(usuario))?.id ?? null
      if (moodleId) {
        password = await renovarContrasenaMoodle(moodleId)
      } else {
        const c = await crearCuentaMoodle({
          email: usuario,
          firstname: s.first_name || '—',
          lastname: [s.last_name, s.second_last_name].filter(Boolean).join(' ') || '—',
          idnumber: s.external_id ?? undefined,
        })
        moodleId = c.moodle_user_id
        password = c.password
      }
    } else {
      if (!moodleId) return NextResponse.json({ error: 'Todavía no tiene cuenta de campus: usa "Crear cuenta"' }, { status: 400 })
      password = await renovarContrasenaMoodle(moodleId)
    }
  } catch (e) {
    return NextResponse.json({ error: `Moodle: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }

  // A dónde se avisa. Por regla al institucional cuando existe, PERO si el
  // estudiante nunca entró a ese buzón, el mensaje se quedaría sin leer: en ese
  // caso va al personal, que es el que sí puede abrir.
  let destino = usuario
  let porQue = 'a su correo de la cuenta'
  if (caso === 'a' && s.email) {
    try {
      const estado = await getStudentAccountState(String(s.email_alt))
      if (!estado.everLoggedIn) {
        destino = s.email
        porQue = 'a su correo personal, porque todavía no ha entrado nunca a su correo estudiantil'
      }
    } catch {
      // Si no se puede consultar Google, se avisa a ambos lados por seguridad.
      destino = s.email
      porQue = 'a su correo personal (no se pudo verificar el acceso al estudiantil)'
    }
  }

  try {
    await notificarCuentaMoodle({
      to: destino, nombre, usuario: String(usuario), password,
      lang: /peru|bolivia|ecuador|colombia|chile|mexico|españa|spain/i.test(String(s.country ?? '')) ? 'es' : 'es',
    })
  } catch (e) {
    return NextResponse.json({
      error: `La cuenta quedó lista pero no se pudo enviar el aviso: ${e instanceof Error ? e.message : String(e)}`,
      moodle_user_id: moodleId,
    }, { status: 500 })
  }

  const ahora = new Date().toISOString()
  await sb.from('academic_students').update({
    moodle_user_id: String(moodleId),
    moodle_credentials_sent_at: ahora,
    moodle_credentials_sent_to: destino,
  }).eq('id', s.id)

  // La contraseña NO se devuelve ni se guarda: ya viajó al estudiante.
  return NextResponse.json({
    ok: true, caso, usuario, moodle_user_id: moodleId,
    enviado_a: destino, nota: `Credenciales enviadas ${porQue}.`,
  })
}
