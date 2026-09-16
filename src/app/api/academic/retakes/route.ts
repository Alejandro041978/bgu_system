import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPagina } from '@/lib/page-guard'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { stableUuid } from '@/lib/grades-write'
import { moodleCall, getUserByIdnumber, getUserByEmail } from '@/lib/moodle'
import { esItemBono } from '@/lib/grade-status'

export const revalidate = 0
export const maxDuration = 120

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

// Beca activa por matrícula (misma fuente que el estado de cuenta: % sobre la
// lista, revoked_at NULL = vigente). La beca del estudiante aplica TAMBIÉN al
// recursado (regla del usuario, 12/09/2026): la cuota se cotiza ya descontada,
// igual que el oficial — que calcula la beca sobre la lista completa, intentos
// extra incluidos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function becasDe(sb: any, studentId: string): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  try {
    const { data } = await sb.from('scholarships')
      .select('enrollment_id, percentage').eq('student_id', studentId).is('revoked_at', null)
    for (const s of (data ?? []) as { enrollment_id: string; percentage: number }[]) {
      if (s.enrollment_id != null && s.percentage != null) m.set(String(s.enrollment_id), Number(s.percentage))
    }
  } catch { /* tabla ausente: sin becas */ }
  return m
}

function cotizar(rate: number, credits: number, becaPct: number | null): number {
  const lista = rate * credits
  const beca = becaPct != null ? lista * (Number(becaPct) / 100) : 0
  return Math.round((lista - beca) * 100) / 100
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pagadoDeCargo(sb: any, chargeExternalId: string): Promise<number> {
  const { data } = await sb.from('account_payments')
    .select('amount').eq('charge_external_id', chargeExternalId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).reduce((a, p) => a + Number(p.amount ?? 0), 0)
}

// ── Sello del intento 1 (16/09/2026, decisión del usuario: sin plugin de
// recompletion — el respaldo vive en el ERP). Captura el intento anterior
// COMPLETO en la solicitud: cada evaluación con nombre, ponderación,
// calificación y FECHA (leídas del aula en vivo, que reporta por usuario
// aunque esté suspendido), los bonos, el acumulado, el mínimo y el estado.
// Si el aula no es alcanzable (intentos heredados de Activa sin aula, o
// Moodle caído), sella desde el acta del ERP (fuente 'erp_acta') — el sello
// nunca bloquea la aceptación, pero SÍ es requisito para la limpieza.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sellarIntento1(sb: any, r: any, quien: string): Promise<{ ok: boolean; error?: string }> {
  const { data: nota } = await sb.from('academic_grades')
    .select('external_id, final_grade, retake_grade, passing_score, estado_academico, rendido_pct, moodle_course_id, term_year, semester_id, last_evaluated_at')
    .eq('student_id', r.student_id).eq('course_id', r.course_id).eq('intento', Number(r.prev_attempt)).maybeSingle()
  if (!nota) return { ok: false, error: 'No se encontró el acta del intento anterior' }
  const { data: det } = await sb.from('academic_grade_details')
    .select('process_grades').eq('external_id', nota.external_id).maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot: any = {
    sellado_en: new Date().toISOString(), sellado_por: quien,
    fuente: 'erp_acta',
    external_id: nota.external_id,
    aula: nota.moodle_course_id ?? null,
    nota_final: nota.retake_grade ?? nota.final_grade ?? null,
    minimo: nota.passing_score ?? null,
    estado: nota.estado_academico ?? 'reprobado',
    rendido_pct: nota.rendido_pct ?? null,
    ultima_evaluacion: nota.last_evaluated_at ?? null,
    detalle_erp: det?.process_grades ?? null,
    evaluaciones: null,
  }

  // Lectura VIVA del aula: valores y fechas de cada evaluación
  if (nota.moodle_course_id) {
    try {
      const { data: stu } = await sb.from('academic_students')
        .select('id, external_id, email, email_alt').eq('id', r.student_id).maybeSingle()
      let mu = stu ? await getUserByIdnumber(String(stu.id)) : null
      if (!mu && stu?.external_id) mu = await getUserByIdnumber(String(stu.external_id))
      if (!mu && stu?.email) mu = await getUserByEmail(String(stu.email))
      if (!mu && stu?.email_alt) mu = await getUserByEmail(String(stu.email_alt))
      if (mu) {
        const rep = await moodleCall('gradereport_user_get_grade_items',
          { courseid: Number(nota.moodle_course_id), userid: mu.id }, { timeoutMs: 30_000 })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = ((rep?.usergrades?.[0]?.gradeitems ?? []) as any[]).filter(i => i.itemtype === 'mod')
        if (items.length) {
          snapshot.fuente = 'moodle_vivo'
          snapshot.moodle_userid = mu.id
          snapshot.evaluaciones = items.map(i => ({
            desc: i.itemname ?? '',
            ponderacion_pct: i.weightraw != null ? Math.round(Number(i.weightraw) * 10000) / 100 : null,
            calificacion: i.graderaw == null ? null : Math.round(Number(i.graderaw) * 100) / 100,
            sobre: i.grademax != null ? Number(i.grademax) : null,
            fecha: i.gradedategraded ? new Date(Number(i.gradedategraded) * 1000).toISOString() : null,
            bono: esItemBono(i.itemname) || undefined,
          }))
        }
      }
    } catch { /* aula inalcanzable: queda el sello desde el acta */ }
  }

  const { error } = await sb.from('course_retake_requests')
    .update({ first_attempt_snapshot: snapshot, sealed_at: new Date().toISOString(), sealed_by: quien })
    .eq('id', r.id).is('sealed_at', null)   // el sello es inmutable: solo una vez
  if (error) return { ok: false, error: error.message }
  return { ok: true }
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
  const becaDe = await becasDe(sb, studentId)

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
    // Pagada por completo → se acepta aquí mismo (regla: el pago habilita) y
    // se intenta el sello del intento 1 en el acto (si falla, queda pendiente
    // con su botón de reintento; la limpieza del aula exige el sello).
    if (estado === 'pendiente_pago' && r.amount != null && pagado >= Number(r.amount) - 0.005) {
      const err = await aceptar(sb, r)
      if (!err) {
        estado = 'aceptada'; r.status = 'aceptada'; r.accepted_at = new Date().toISOString()
        if (!r.sealed_at) {
          const s = await sellarIntento1(sb, r, 'aceptacion-automatica')
          if (s.ok) { r.sealed_at = new Date().toISOString() }
        }
      }
    }
    if (estado !== 'anulada') abiertas.add(String(r.course_id))
    const c = cursoDe.get(String(r.course_id))
    solicitudes.push({
      id: r.id, course_id: r.course_id,
      course: c ? [c.code, c.name].filter(Boolean).join(' · ') : r.course_id,
      prev_attempt: r.prev_attempt, new_attempt: r.new_attempt,
      credits: r.credits, amount: r.amount, pagado: Math.round(pagado * 100) / 100,
      status: estado, created_at: r.created_at, created_by: r.created_by,
      accepted_at: r.accepted_at, note: r.note ?? null,
      sealed_at: r.sealed_at ?? null,
      sello_fuente: r.first_attempt_snapshot?.fuente ?? null,
      sello_evaluaciones: Array.isArray(r.first_attempt_snapshot?.evaluaciones) ? r.first_attempt_snapshot.evaluaciones.length : null,
      sello_nota: r.first_attempt_snapshot?.nota_final ?? null,
      lms_cleaned_at: r.lms_cleaned_at ?? null,
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
    const becaPct = enr?.id != null ? (becaDe.get(String(enr.id)) ?? null) : null
    elegibles.push({
      course_id: cid,
      course: c ? [c.code, c.name].filter(Boolean).join(' · ') : cid,
      attempt: Number(m.attempt ?? 1),
      credits,
      rate,
      beca_pct: becaPct,
      amount: rate != null && credits != null ? cotizar(rate, credits, becaPct) : null,
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
  // La beca vigente de SU matrícula descuenta la cuota del recursado también
  const becas = await becasDe(sb, b.student_id)
  const becaPct = enrId ? (becas.get(String(enrId)) ?? null) : null
  const amount = cotizar(rate, credits, becaPct)

  const { data: nueva, error: eIns } = await sb.from('course_retake_requests').insert({
    student_id: b.student_id, course_id: b.course_id, program_id: programId,
    program_enrollment_id: enrId,
    prev_attempt: Number(ult.attempt ?? 1), new_attempt: Number(ult.attempt ?? 1) + 1,
    credits, amount, created_by: usuario?.email ?? null,
    note: becaPct != null ? `${credits} cr × $${rate} − beca ${becaPct}%` : `${credits} cr × $${rate}`,
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

// PATCH { id, seal: true } → sella (o reintenta sellar) el intento 1.
// PATCH { id, lms_cleaned: true } → constancia de que el estudiante fue
// limpiado en el aula; EXIGE el sello puesto — nunca se limpia sin respaldo.
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_retakes')
  if (noAutorizado) return noAutorizado
  const usuario = await requireAuth()
  const b = await req.json().catch(() => null) as { id?: string; seal?: boolean; lms_cleaned?: boolean } | null
  if (!b?.id || (!b.seal && !b.lms_cleaned)) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  const sb = db()
  const { data: r } = await sb.from('course_retake_requests').select('*').eq('id', b.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  if (r.status !== 'aceptada') return NextResponse.json({ error: 'Solo sobre solicitudes aceptadas' }, { status: 409 })

  if (b.seal) {
    if (r.sealed_at) return NextResponse.json({ error: 'El intento 1 ya está sellado (el sello es inmutable)' }, { status: 409 })
    const s = await sellarIntento1(sb, r, usuario?.email ?? 'erp')
    if (!s.ok) return NextResponse.json({ error: s.error ?? 'No se pudo sellar' }, { status: 500 })
    return NextResponse.json({ ok: true, sealed: true })
  }

  if (!r.sealed_at) {
    return NextResponse.json({ error: 'El aula no se limpia sin el sello del intento 1: sella primero.' }, { status: 409 })
  }
  const { error } = await sb.from('course_retake_requests')
    .update({ lms_cleaned_at: new Date().toISOString(), lms_cleaned_by: usuario?.email ?? null })
    .eq('id', b.id)
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
