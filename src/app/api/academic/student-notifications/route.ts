import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardPagina } from '@/lib/page-guard'
import { notificarEstudiante, KINDS_CON_SECRETO } from '@/lib/student-notifications'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET ?student_id → la bitácora completa de correos que el ERP le ha enviado.
// POST { resend_id } → reenvía una notificación (misma plantilla y asunto,
// como una fila NUEVA de la bitácora — la fallida original queda como historia).
export async function GET(req: NextRequest) {
  // Consultar la bitácora es VER la página; reenviar (POST) exige editar.
  const noAutorizado = await guardPagina('academic_student_notifications', 'view')
  if (noAutorizado) return noAutorizado
  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Falta student_id' }, { status: 400 })
  const { data, error } = await db().from('student_notifications')
    .select('id, kind, subject, body_html, to_emails, status, error, sent_at, triggered_by')
    .eq('student_id', studentId).order('sent_at', { ascending: false }).limit(300)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notificaciones: data ?? [] })
}

export async function POST(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_student_notifications')
  if (noAutorizado) return noAutorizado
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  const b = await req.json().catch(() => null) as { resend_id?: string } | null
  if (!b?.resend_id) return NextResponse.json({ error: 'Falta resend_id' }, { status: 400 })
  const sb = db()
  const { data: orig } = await sb.from('student_notifications').select('*').eq('id', b.resend_id).maybeSingle()
  if (!orig) return NextResponse.json({ error: 'Notificación no encontrada' }, { status: 404 })
  // El cuerpo guardado de estos tipos tiene el secreto enmascarado: reenviarlo
  // mandaría puntos. Credenciales y enlaces se regeneran desde su propia página.
  if (KINDS_CON_SECRETO.has(orig.kind)) {
    return NextResponse.json({ error: 'Este correo contiene un secreto (contraseña, enlace o código) que la bitácora guarda enmascarado: no se puede reenviar desde aquí. Genera uno nuevo desde su propia página (credenciales, acceso al portal, etc.).' }, { status: 400 })
  }
  const r = await notificarEstudiante(sb, {
    studentId: orig.student_id, enrollmentId: orig.enrollment_id,
    kind: orig.kind, subject: orig.subject, html: orig.body_html,
    relatedId: orig.related_id, triggeredBy: `reenvío:${user?.email ?? user?.id ?? '—'}`,
  })
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 })
}
