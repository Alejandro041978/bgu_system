import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST → latido del Portal del Estudiante (cada minuto mientras esté abierto).
// Mantiene student_portal_presence para el "conectados ahora" del reporte.
export async function POST() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 })

  const sb = db()
  const mail = user.email.toLowerCase()
  const { data: stu } = await sb.from('academic_students')
    .select('id').or(`email.eq.${mail},email_alt.eq.${mail}`).limit(1).maybeSingle()
  if (!stu) return NextResponse.json({ ok: false })   // staff mirando el portal: no cuenta

  await sb.from('student_portal_presence').upsert(
    { student_id: stu.id, email: mail, last_seen: new Date().toISOString() },
    { onConflict: 'student_id' },
  )
  return NextResponse.json({ ok: true })
}
