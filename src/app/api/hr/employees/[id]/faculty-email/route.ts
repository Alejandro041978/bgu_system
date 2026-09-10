import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardPagina } from '@/lib/page-guard'
import { createFacultyEmail, notifyFacultyEmail, resetStudentPassword, googleConfigured } from '@/lib/google-workspace'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Correo institucional del docente (@faculty.blackwell.university), 09/09/2026.
//
// Mismo tenant de Google que los correos estudiantiles; distinto dominio y
// unidad organizativa (/Faculty). Solo desde la ficha del colaborador con la
// casilla Faculty marcada.
//
// POST { action?: 'crear' | 'reset' }
//   crear → cuenta nueva primernombre.primerapellido@faculty.… + aviso con
//           credenciales al correo personal
//   reset → contraseña temporal nueva en la cuenta existente + aviso
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Crear un acceso institucional es un acto de Talento Humano: exige editar.
  const noAutorizado = await guardPagina('hr')
  if (noAutorizado) return noAutorizado
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()

  if (!googleConfigured()) {
    return NextResponse.json({ error: 'Google Workspace no está configurado (faltan las variables GOOGLE_OAUTH_*)' }, { status: 503 })
  }

  const { id } = await params
  const b = await req.json().catch(() => ({})) as { action?: 'crear' | 'reset' }
  const action = b.action ?? 'crear'

  const sb = db()
  const { data: emp } = await sb.from('hr_employees')
    .select('id, full_name, first_names, last_names, email, phone, is_faculty, faculty_email')
    .eq('id', id).maybeSingle()
  if (!emp) return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 })
  if (!emp.is_faculty) {
    return NextResponse.json({ error: 'La ficha no tiene la casilla Faculty: el correo docente es solo para docentes.' }, { status: 409 })
  }
  if (!emp.email) {
    return NextResponse.json({ error: 'El colaborador no tiene correo personal registrado: no habría a dónde enviarle las credenciales.' }, { status: 409 })
  }
  const nombre = emp.full_name || [emp.first_names, emp.last_names].filter(Boolean).join(' ')

  if (action === 'reset') {
    if (!emp.faculty_email) return NextResponse.json({ error: 'Aún no tiene correo docente: créalo primero.' }, { status: 409 })
    try {
      const created = await resetStudentPassword(emp.faculty_email)
      await notifyFacultyEmail(emp.email, nombre, created, 'reset')
      await sb.from('hr_employees').update({
        faculty_email_sent_at: new Date().toISOString(), faculty_email_sent_to: emp.email,
      }).eq('id', id)
      return NextResponse.json({ ok: true, email: emp.faculty_email, sent_to: emp.email })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  // crear
  if (emp.faculty_email) {
    return NextResponse.json({ error: `Ya tiene correo docente (${emp.faculty_email}). Usa "reenviar credenciales" para restablecer la contraseña.` }, { status: 409 })
  }
  // Alias ocupados localmente: los correos docentes ya asignados en el ERP
  // (contra Google se verifica además dentro de la creación).
  const taken = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('hr_employees')
      .select('faculty_email').not('faculty_email', 'is', null).range(from, from + 999)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (data ?? []) as any[]) taken.add(String(r.faculty_email).toLowerCase())
    if ((data ?? []).length < 1000) break
  }

  try {
    const created = await createFacultyEmail(emp, taken, { email: emp.email, phone: emp.phone })
    const { error: saveErr } = await sb.from('hr_employees')
      .update({ faculty_email: created.email }).eq('id', id)
    if (saveErr) {
      return NextResponse.json({ error: `Cuenta creada en Google (${created.email}) pero no se pudo guardar en la ficha: ${saveErr.message}` }, { status: 500 })
    }
    let notified = false, notifyError: string | null = null
    try {
      await notifyFacultyEmail(emp.email, nombre, created, 'alta')
      notified = true
      await sb.from('hr_employees').update({
        faculty_email_sent_at: new Date().toISOString(), faculty_email_sent_to: emp.email,
      }).eq('id', id)
    } catch (e) { notifyError = e instanceof Error ? e.message : String(e) }
    return NextResponse.json({
      ok: true, email: created.email, notified, notify_error: notifyError,
      created_by: user?.email ?? user?.id ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
