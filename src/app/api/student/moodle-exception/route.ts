import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveStudent } from '@/lib/student-identity'
import { overdueForStudent, unsuspendStudent, selfServiceUsedThisSemester, SELF_SERVICE_MAX_PER_SEMESTER } from '@/lib/moodle-access'
import { reviewJustification } from '@/lib/exception-review'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveStudent(sb: any, ident: { email: string | null; document_number: string | null }) {
  if (ident.email) {
    const { data } = await sb.from('academic_students').select('id, first_name, last_name, second_last_name, situation').eq('email', ident.email).eq('disabled', false).maybeSingle()
    if (data) return data
  }
  if (ident.document_number) {
    const { data } = await sb.from('academic_students').select('id, first_name, last_name, second_last_name, situation').eq('document_number', ident.document_number).maybeSingle()
    if (data) return data
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function status(sb: any, studentId: string, situation: string) {
  const now = new Date().toISOString()
  const overdue = await overdueForStudent(sb, studentId)
  const { data: exc } = await sb.from('moodle_access_exceptions')
    .select('id, expires_at, days, source').eq('student_id', studentId).gt('expires_at', now)
    .order('expires_at', { ascending: false }).limit(1).maybeSingle()
  const used = await selfServiceUsedThisSemester(sb, studentId)
  const isPartner = situation === 'campus_socio'
  const { data: recientes } = await sb.from('moodle_exception_requests')
    .select('days, decision, decision_reason, created_at').eq('student_id', studentId)
    .order('created_at', { ascending: false }).limit(5)
  return {
    overdue, is_partner: isPartner, active_exception: exc ?? null,
    used, max: SELF_SERVICE_MAX_PER_SEMESTER,
    can_request: overdue > 0.005 && !isPartner && !exc && used < SELF_SERVICE_MAX_PER_SEMESTER,
    recientes: recientes ?? [],
  }
}

export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'No es un estudiante' }, { status: 403 })
  const sb = db()
  const stu = await resolveStudent(sb, ident)
  if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })
  return NextResponse.json(await status(sb, stu.id, stu.situation))
}

export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'No es un estudiante' }, { status: 403 })

  const b = await req.json().catch(() => null) as { days?: number; justification?: string } | null
  const days = Number(b?.days)
  const justification = (b?.justification ?? '').trim()
  if (![3, 5].includes(days)) return NextResponse.json({ error: 'Elige 3 o 5 días' }, { status: 400 })
  if (justification.length < 15) return NextResponse.json({ error: 'Escribe una justificación (mínimo 15 caracteres)' }, { status: 400 })

  const sb = db()
  const stu = await resolveStudent(sb, ident)
  if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  // Elegibilidad (defensa server-side)
  const st = await status(sb, stu.id, stu.situation)
  if (st.overdue <= 0.005) return NextResponse.json({ error: 'No tienes deuda vencida: no necesitas una excepción.' }, { status: 400 })
  if (st.is_partner) return NextResponse.json({ error: 'Tu programa es de un campus aliado; esta excepción no aplica.' }, { status: 400 })
  if (st.active_exception) return NextResponse.json({ error: 'Ya tienes una excepción vigente. Espera a que venza para pedir otra.' }, { status: 400 })
  if (st.used >= st.max) return NextResponse.json({ error: `Ya usaste tus ${st.max} excepciones de este semestre. Escríbele a Sofía para coordinar una solución.`, sofia: true }, { status: 400 })

  const name = [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' ')
  const verdict = await reviewJustification({ studentName: name, days, overdue: st.overdue, justification })

  let exceptionId: string | null = null
  if (verdict.decision === 'aceptada') {
    const expires = new Date(Date.now() + days * 86400000).toISOString()
    const { data: ins } = await sb.from('moodle_access_exceptions').insert({
      student_id: stu.id, granted_by: `bot:${user.email ?? 'portal'}`, expires_at: expires, days,
      source: 'estudiante', justification, note: justification,
    }).select('id').maybeSingle()
    exceptionId = ins?.id ?? null
    // Reactiva Moodle de inmediato (la gracia surte efecto ya)
    await unsuspendStudent(sb, stu.id).catch(() => null)
  }

  await sb.from('moodle_exception_requests').insert({
    student_id: stu.id, days, justification, decision: verdict.decision,
    decision_reason: verdict.reason, exception_id: exceptionId,
  })

  return NextResponse.json({
    decision: verdict.decision, reason: verdict.reason,
    expires_at: exceptionId ? new Date(Date.now() + days * 86400000).toISOString() : null,
    sofia: verdict.decision === 'rechazada',
  })
}
