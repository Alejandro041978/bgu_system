import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { applyGradeEdit } from '@/lib/grades-write'
import { guardStaff, guardSuperadmin } from '@/lib/api-guard'
import { guardPagina } from '@/lib/page-guard'
import { eligibleCourses, createExamRequest } from '@/lib/exam-requests'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET ?student=<id> → asignaturas elegibles de ese estudiante + tipos de examen
// activos. Es lo que necesita el formulario de "Nueva solicitud": la lista de
// elegibles la calcula el servidor con la MISMA regla que el portal del
// estudiante, para que Registros no pueda ofrecer una asignatura que el
// estudiante no podría pedir.
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const studentId = req.nextUrl.searchParams.get('student')
  if (studentId) {
    const sb = db()
    const { data: stu } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number').eq('id', studentId).maybeSingle()
    if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })
    const [elegibles, { data: tipos }] = await Promise.all([
      eligibleCourses(sb, stu.id, stu.document_number ? String(stu.document_number) : null),
      sb.from('exam_types').select('id, name, price').eq('active', true).order('name'),
    ])
    return NextResponse.json({
      student: { id: stu.id, name: [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' '), document_number: stu.document_number },
      elegibles,
      tipos: tipos ?? [],
    })
  }

  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const status = req.nextUrl.searchParams.get('status')

  // Sin joins embebidos: exam_requests no tiene FKs declaradas y PostgREST
  // rechaza los embeds (la pagina quedaba en spinner infinito). Lecturas
  // planas + lookups por lote.
  let q = sb.from('exam_requests').select('*').order('requested_at', { ascending: false }).limit(500)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Falta correr supabase/exam_requests.sql: ' + error.message }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = (data ?? []) as any[]
  const stuIds = [...new Set(base.map(r => String(r.student_id)).filter(x => x && x !== 'null'))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stuById = new Map<string, any>()
  for (let i = 0; i < stuIds.length; i += 200) {
    const { data: s } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, email, email_alt').in('id', stuIds.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const x of (s ?? []) as any[]) stuById.set(String(x.id), x)
  }
  const typeIds = [...new Set(base.map(r => String(r.exam_type_id)).filter(x => x && x !== 'null'))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typeById = new Map<string, any>()
  if (typeIds.length) {
    const { data: t } = await sb.from('exam_types').select('id, name, price').in('id', typeIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const x of (t ?? []) as any[]) typeById.set(String(x.id), x)
  }

  const rows = base.map(r => {
    const stu = stuById.get(String(r.student_id))
    return {
      ...r,
      exam_types: typeById.get(String(r.exam_type_id)) ?? null,
      student_name: [stu?.first_name, stu?.last_name, stu?.second_last_name].filter(Boolean).join(' '),
      document: stu?.document_number ? String(stu.document_number) : '',
      student_email: stu?.email_alt ?? stu?.email ?? null,
    }
  })
  const counts = { pendiente_pago: 0, pendiente_evaluacion: 0, evaluado: 0, anulado: 0 } as Record<string, number>
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1
  return NextResponse.json({ rows, counts })
}

// PATCH { id, action: 'notificado' | 'nota' | 'anular', grade? }
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as { id?: string; action?: string; grade?: number } | null
  if (!b?.id || !b?.action) return NextResponse.json({ error: 'Faltan id y action' }, { status: 400 })

  const sb = db()
  const { data: r } = await sb.from('exam_requests').select('*').eq('id', b.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  const now = new Date().toISOString()

  if (b.action === 'notificado') {
    if (r.status !== 'pendiente_evaluacion') return NextResponse.json({ error: 'Solo se notifica una solicitud pagada (pendiente de evaluación)' }, { status: 400 })
    const { error } = await sb.from('exam_requests').update({ notified_at: now }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'nota') {
    // Registrar la nota de la subsanación ES escribir una calificación: va al
    // acta por la misma vía que el editor. Notificar o anular la solicitud
    // siguen siendo trabajo de Registros; esto no.
    const soloSuper = await guardSuperadmin()
    if (soloSuper) return soloSuper
    if (r.status !== 'pendiente_evaluacion') return NextResponse.json({ error: 'La solicitud no está pendiente de evaluación' }, { status: 400 })
    const grade = Number(b.grade)
    if (!Number.isFinite(grade) || grade < 0 || grade > 100) return NextResponse.json({ error: 'Nota inválida (0-100)' }, { status: 400 })
    if (!r.grade_external_id) return NextResponse.json({ error: 'La solicitud no tiene fila del acta enlazada' }, { status: 400 })

    // La nota viaja al acta como RECUPERACIÓN (la mejor gana), con auditoría,
    // blindaje contra el sync y avance de carrusel/egreso inmediatos.
    const edit = await applyGradeEdit(sb, {
      externalId: r.grade_external_id,
      changes: { retake_grade: grade },
      reason: `Examen de subsanación (solicitud ${String(b.id).slice(0, 8)})`,
      userId: user.email ?? user.id,
      origin: 'editor',
    })
    if (!edit.ok) return NextResponse.json({ error: edit.note ?? 'No se pudo escribir la nota en el acta' }, { status: 500 })

    const { error } = await sb.from('exam_requests').update({
      status: 'evaluado', result_grade: grade, evaluated_by: user.email ?? user.id, evaluated_at: now,
    }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, acta: edit.changed })
  }

  if (b.action === 'anular') {
    if (r.status === 'evaluado') return NextResponse.json({ error: 'Ya evaluada: no se puede anular' }, { status: 400 })
    // Borra el cargo si sigue impago (misma regla que documentos)
    let cuota_borrada = false
    if (r.charge_external_id) {
      const { count } = await sb.from('account_payments')
        .select('id', { count: 'exact', head: true }).eq('charge_external_id', r.charge_external_id)
      if ((count ?? 0) > 0 && r.status === 'pendiente_pago') {
        return NextResponse.json({ error: 'La cuota ya tiene pagos: registra el reembolso antes de anular' }, { status: 409 })
      }
      if ((count ?? 0) === 0) {
        await sb.from('account_charges').delete().eq('external_id', r.charge_external_id)
        cuota_borrada = true
      }
    }
    const { error } = await sb.from('exam_requests').update({ status: 'anulado' }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, cuota_borrada })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}

// POST { student_id, exam_type_id, grade_external_id } → crea la solicitud EN
// NOMBRE del estudiante.
//
// Hasta ahora la única puerta era el portal del estudiante. Ésta es la segunda,
// para los casos en que el estudiante no puede o no sabe pedirla, y pasa por el
// mismo motor: la elegibilidad se revalida en el servidor con la misma regla
// —desaprobada y con al menos el 70% de la ponderación rendida—, así que
// Registros no puede crear una solicitud que el estudiante no podría pedir.
//
// Se registra de qué puerta vino y quién la abrió. Genera un cargo real en el
// estado de cuenta de una persona: eso no puede quedar sin autor.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardPagina('academic_exams')
  if (noAutorizado) return noAutorizado

  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null) as
    { student_id?: string; exam_type_id?: string; grade_external_id?: string } | null
  if (!b?.student_id || !b?.exam_type_id || !b?.grade_external_id) {
    return NextResponse.json({ error: 'Faltan estudiante, tipo de examen o asignatura' }, { status: 400 })
  }

  const sb = db()
  const { data: stu } = await sb.from('academic_students')
    .select('id, document_number').eq('id', b.student_id).maybeSingle()
  if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  const r = await createExamRequest(
    stu.id, stu.document_number ? String(stu.document_number) : null,
    b.exam_type_id, b.grade_external_id,
    { source: 'erp', by: user.email ?? user.id },
  )
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true, charge: r.charge })
}
