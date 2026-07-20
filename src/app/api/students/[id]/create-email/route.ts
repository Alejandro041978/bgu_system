import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createStudentEmail, notifyStudentEmail, googleConfigured, langFor } from '@/lib/google-workspace'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST → crea el correo estudiantil @blackwell.pro del estudiante y le
// notifica a su correo personal. Reutilizable: botón de la Ficha y matrícula.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sb = db()

  if (!googleConfigured()) {
    return NextResponse.json({ error: 'Google Workspace no está configurado aún: faltan GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN en Vercel (autorizar en /api/google/oauth/start)' }, { status: 503 })
  }

  const { data: s } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, email, email_alt, country').eq('id', id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })
  if (s.email_alt) return NextResponse.json({ error: `El estudiante ya tiene correo institucional: ${s.email_alt}` }, { status: 409 })

  // Derecho a correo: al menos una matrícula en Bachelor / Master / Doctorado
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('academic_programs(name, category:academic_programs_category(name))').eq('student_id', id)
  const catNames = [...new Set(((enr ?? []) as { academic_programs: { name: string; category: { name: string } | null } | null }[])
    .map(e => e.academic_programs?.category?.name).filter(Boolean))] as string[]
  if (!catNames.some(n => /bachelor|master|doctor/i.test(n))) {
    return NextResponse.json({
      error: `Solo Bachelor, Master y Doctorado tienen derecho a correo estudiantil. Categorías del estudiante: ${catNames.join(', ') || '(sin matrículas)'}`,
    }, { status: 403 })
  }

  // Alias ya ocupados en nuestra base (Google se consulta dentro)
  const taken = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_students')
      .select('email_alt').not('email_alt', 'is', null).range(from, from + 999)
    for (const r of (data ?? [])) taken.add(String(r.email_alt).toLowerCase())
    if ((data ?? []).length < 1000) break
  }

  try {
    const created = await createStudentEmail(s, taken)
    const { error } = await sb.from('academic_students').update({ email_alt: created.email }).eq('id', id)
    if (error) return NextResponse.json({ error: `Cuenta creada en Google (${created.email}) pero no se pudo guardar: ${error.message}` }, { status: 500 })

    let notified = false, notifyError: string | null = null
    if (s.email) {
      try {
        await notifyStudentEmail(s.email, [s.first_name, s.last_name].filter(Boolean).join(' '), created, langFor(s.country))
        notified = true
      } catch (e) { notifyError = e instanceof Error ? e.message : String(e) }
    } else {
      notifyError = 'El estudiante no tiene correo personal registrado: entrégale las credenciales por otro canal'
    }
    return NextResponse.json({ ok: true, email: created.email, notified, notify_error: notifyError })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
