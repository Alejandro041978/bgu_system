import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPagina } from '@/lib/page-guard'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { stableUuid } from '@/lib/grades-write'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const CHARGE_TUITION = 2

async function requireAuth() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// ---------------------------------------------------------------------------
// Recursados DECLARADOS (12/09/2026). El recursado no se deduce de Moodle: se
// declara aquí, se cobra por adelantado y recién entonces se abre.
//
//   1. Elegible = asignatura cuyo ÚLTIMO intento está 'reprobada' según el
//      estado calculado del registro (el objetivo, que sabe cuánto se rindió;
//      nunca "nota < mínimo", que confunde una acumulación parcial con un
//      desaprobado — objeción del usuario, 12/09/2026).
//   2. La solicitud crea UNA cuota tuition (no fraccionable, referencia
//      'Recursado') asociada a ella. La matrícula por asignatura NO se abre
//      todavía.
//   3. Cuando la cuota está pagada por completo, la solicitud se acepta SOLA
//      (al consultar esta API): nace el intento N+1 en el registro (el precio
//      oficial sube y cuadra con lo facturado) y queda la instrucción de abrir
//      el recompletion en el LMS.
//   4. El importador solo escribe notas del recursado sobre intentos
//      declarados (grades-write.resolveImportTarget).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pagadoDeCargo(sb: any, chargeExternalId: string): Promise<number> {
  const { data } = await sb.from('account_payments')
    .select('amount').eq('charge_external_id', chargeExternalId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).reduce((a, p) => a + Number(p.amount ?? 0), 0)
}

// Acepta una solicitud pagada: crea el intento declarado en el registro. El
// upsert por (student, course, attempt) la hace idempotente — si la aceptación
// se reintenta, encuentra la misma fila.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aceptar(sb: any, r: any): Promise<string | null> {
  const { data: st } = await sb.from('academic_students').select('document_number').eq('id', r.student_id).maybeSingle()
  const { error: eM } = await sb.from('academic_course_enrollments').upsert({
    id: stableUuid(`retake:mat:${r.id}`),
    student_id: r.student_id,
    document_number: st?.document_number ?? null,
    course_id: r.course_id,
    program_id: r.program_id ?? null,
    program_enrollment_id: r.program_enrollment_id ?? null,
    attempt: Number(r.new_attempt),
    status: 'no_iniciada',
    source: 'recursado',
    opened_at: new Date().toISOString(),
    opened_by: `recursado:${r.created_by ?? 'erp'}`,
  }, { onConflict: 'student_id,course_id,attempt' })
  if (eM) return eM.message
  const { error: eR } = await sb.from('course_retake_requests')
    .update({ status: 'aceptada', accepted_at: new Date().toISOString() })
    .eq('id', r.id).eq('status', 'pendiente_pago')
  return eR ? eR.message : null
}

export async function GET(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_retakes', 'view')
  if (noAutorizado) return noAutorizado
  const sb = db()
  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Falta student_id' }, { status: 400 })

  const { data: student } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, document_number, external_id').eq('id', studentId).maybeSingle()
  if (!student) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  // Registro por asignatura: manda el intento más alto de cada una
  const { data: mats } = await sb.from('academic_course_enrollments')
    .select('course_id, program_id, program_enrollment_id, attempt, status')
    .eq('student_id', studentId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ultimo = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (mats ?? []) as any[]) {
    if (!m.course_id) continue
    const k = String(m.course_id)
    if (!ultimo.has(k) || Number(m.attempt ?? 1) > Number(ultimo.get(k).attempt ?? 1)) ultimo.set(k, m)
  }

  const courseIds = [...ultimo.keys()]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cursoDe = new Map<string, any>()
  for (let i = 0; i < courseIds.length; i += 150) {
    const { data } = await sb.from('academic_courses')
      .select('id, name, code, credits, program_id').in('id', courseIds.slice(i, i + 150))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (data ?? []) as any[]) cursoDe.set(String(c.id), c)
  }
  const { data: enrs } = await sb.from('academic_student_enrollments')
    .select('id, program_id, credit_rate').eq('student_id', studentId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrDePrograma = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (enrs ?? []) as any[]) if (e.program_id) enrDePrograma.set(String(e.program_id), e)

  const { data: reqs } = await sb.from('course_retake_requests')
    .select('*').eq('student_id', studentId).order('created_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const solicitudes: any[] = []
  const abiertas = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (reqs ?? []) as any[]) {
    let pagado = 0
    if (r.charge_external_id) pagado = await pagadoDeCargo(sb, r.charge_external_id)
    let estado = String(r.status)
    // Pagada por completo → se acepta aquí mismo (regla: el pago habilita)
    if (estado === 'pendiente_pago' && r.amount != null && pagado >= Number(r.amount) - 0.005) {
      const err = await aceptar(sb, r)
      if (!err) { estado = 'aceptada'; r.status = 'aceptada'; r.accepted_at = new Date().toISOString() }
    }
    if (estado !== 'anulada') abiertas.add(String(r.course_id))
    const c = cursoDe.get(String(r.course_id))
    solicitudes.push({
      id: r.id, course_id: r.course_id,
      course: c ? [c.code, c.name].filter(Boolean).join(' · ') : r.course_id,
      prev_attempt: r.prev_attempt, new_attempt: r.new_attempt,
      credits: r.credits, amount: r.amount, pagado: Math.round(pagado * 100) / 100,
      status: estado, created_at: r.created_at, created_by: r.created_by,
      accepted_at: r.accepted_at, lms_opened_at: r.lms_opened_at,
    })
  }

  // Elegibles: último intento 'reprobada' (estado calculado del registro),
  // sin solicitud viva y con tarifa conocida para cotizar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elegibles: any[] = []
  for (const [cid, m] of ultimo) {
    if (String(m.status) !== 'reprobada') continue
    if (abiertas.has(cid)) continue
    const c = cursoDe.get(cid)
    const enr = m.program_enrollment_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((enrs ?? []) as any[]).find(e => String(e.id) === String(m.program_enrollment_id))
      : (m.program_id ? enrDePrograma.get(String(m.program_id)) : null)
    const rate = enr?.credit_rate != null ? Number(enr.credit_rate) : null
    const credits = c?.credits != null ? Number(c.credits) : null
    elegibles.push({
      course_id: cid,
      course: c ? [c.code, c.name].filter(Boolean).join(' · ') : cid,
      attempt: Number(m.attempt ?? 1),
      credits,
      rate,
      amount: rate != null && credits != null ? Math.round(rate * credits * 100) / 100 : null,
      program_enrollment_id: m.program_enrollment_id ?? enr?.id ?? null,
      program_id: m.program_id ?? c?.program_id ?? null,
    })
  }
  elegibles.sort((a, b) => String(a.course).localeCompare(String(b.course)))

  return NextResponse.json({
    student: {
      id: student.id,
      name: [student.first_name, student.last_name, student.second_last_name].filter(Boolean).join(' '),
      document: student.document_number, external_id: student.external_id,
    },
    elegibles, solicitudes,
  })
}

// POST { student_id, course_id } → crea la solicitud y su cuota asociada.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_retakes')
  if (noAutorizado) return noAutorizado
  const usuario = await requireAuth()
  const b = await req.json().catch(() => null) as { student_id?: string; course_id?: string } | null
  if (!b?.student_id || !b?.course_id) return NextResponse.json({ error: 'Faltan student_id y course_id' }, { status: 400 })
  const sb = db()

  // Re-verificación en el servidor: la pantalla propone, la base decide
  const { data: mats } = await sb.from('academic_course_enrollments')
    .select('course_id, program_id, program_enrollment_id, attempt, status')
    .eq('student_id', b.student_id).eq('course_id', b.course_id).order('attempt', { ascending: false })
  const ult = (mats ?? [])[0]
  if (!ult) return NextResponse.json({ error: 'El estudiante no tiene esa asignatura en su registro' }, { status: 409 })
  if (String(ult.status) !== 'reprobada') {
    return NextResponse.json({ error: `El último intento no está reprobado (está: ${ult.status}). Solo se recursa lo reprobado según el estado calculado.` }, { status: 409 })
  }
  const { data: viva } = await sb.from('course_retake_requests')
    .select('id, status').eq('student_id', b.student_id).eq('course_id', b.course_id).neq('status', 'anulada').limit(1)
  if ((viva ?? []).length) return NextResponse.json({ error: 'Ya existe una solicitud viva para esa asignatura' }, { status: 409 })

  const { data: curso } = await sb.from('academic_courses')
    .select('id, name, code, credits, program_id').eq('id', b.course_id).maybeSingle()
  if (!curso) return NextResponse.json({ error: 'Asignatura no encontrada' }, { status: 404 })
  const programId = ult.program_id ?? curso.program_id ?? null

  // La tarifa congelada de SU matrícula en ese programa (regla de precios)
  let enrId = ult.program_enrollment_id ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let enr: any = null
  if (enrId) {
    const { data } = await sb.from('academic_student_enrollments').select('id, credit_rate, program_id').eq('id', enrId).maybeSingle()
    enr = data
  }
  if (!enr && programId) {
    const { data } = await sb.from('academic_student_enrollments')
      .select('id, credit_rate, program_id').eq('student_id', b.student_id).eq('program_id', programId).limit(1)
    enr = (data ?? [])[0] ?? null
  }
  enrId = enr?.id ?? enrId
  const rate = enr?.credit_rate != null ? Number(enr.credit_rate) : null
  const credits = curso.credits != null ? Number(curso.credits) : null
  if (rate == null || credits == null) {
    return NextResponse.json({ error: 'Sin tarifa congelada o sin créditos: no se puede cotizar la cuota. Revisa la matrícula del programa.' }, { status: 409 })
  }
  const amount = Math.round(rate * credits * 100) / 100

  const { data: nueva, error: eIns } = await sb.from('course_retake_requests').insert({
    student_id: b.student_id, course_id: b.course_id, program_id: programId,
    program_enrollment_id: enrId,
    prev_attempt: Number(ult.attempt ?? 1), new_attempt: Number(ult.attempt ?? 1) + 1,
    credits, amount, created_by: usuario?.email ?? null,
  }).select('id').single()
  if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 })

  // La cuota asociada: UNA sola, no fraccionable, referencia 'Recursado'.
  // Vence en 7 días; su pago completo acepta la solicitud.
  const chargeId = stableUuid(`retake:cuota:${nueva.id}`)
  const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  const { error: eCh } = await sb.from('account_charges').upsert({
    external_id: chargeId, student_id: b.student_id, enrollment_id: enrId,
    amount, due_date: due, charge_type: CHARGE_TUITION, source: 'erp',
    reference: `Recursado ${[curso.code, curso.name].filter(Boolean).join(' ')}`.slice(0, 120),
  }, { onConflict: 'external_id' })
  if (eCh) {
    await sb.from('course_retake_requests').delete().eq('id', nueva.id)
    return NextResponse.json({ error: `No se pudo crear la cuota: ${eCh.message}` }, { status: 500 })
  }
  await sb.from('course_retake_requests').update({ charge_external_id: chargeId }).eq('id', nueva.id)
  return NextResponse.json({ ok: true, id: nueva.id, amount, due_date: due })
}

// PATCH { id, lms_opened: true } → deja constancia de que el recompletion ya
// se abrió en el aula (trazabilidad ERP↔LMS mientras el plugin no sea remoto).
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_retakes')
  if (noAutorizado) return noAutorizado
  const usuario = await requireAuth()
  const b = await req.json().catch(() => null) as { id?: string; lms_opened?: boolean } | null
  if (!b?.id || !b?.lms_opened) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  const sb = db()
  const { error } = await sb.from('course_retake_requests')
    .update({ lms_opened_at: new Date().toISOString(), lms_opened_by: usuario?.email ?? null })
    .eq('id', b.id).eq('status', 'aceptada')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= → anula una solicitud PENDIENTE sin pagos: borra su cuota.
export async function DELETE(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_retakes', 'delete')
  if (noAutorizado) return noAutorizado
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { data: r } = await sb.from('course_retake_requests').select('*').eq('id', id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  if (r.status !== 'pendiente_pago') return NextResponse.json({ error: 'Solo se anula una solicitud pendiente de pago' }, { status: 409 })
  if (r.charge_external_id) {
    const pagado = await pagadoDeCargo(sb, r.charge_external_id)
    if (pagado > 0.005) return NextResponse.json({ error: 'La cuota ya tiene pagos: no se anula (mueve o devuelve el pago primero)' }, { status: 409 })
    const { error: eCh } = await sb.from('account_charges').delete().eq('external_id', r.charge_external_id)
    if (eCh) return NextResponse.json({ error: `No se pudo eliminar la cuota: ${eCh.message}` }, { status: 500 })
  }
  const { error } = await sb.from('course_retake_requests').update({ status: 'anulada' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
