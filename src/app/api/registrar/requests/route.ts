import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { checkRequirements, hasBlockingFailure } from '@/lib/document-requirements'
import { emitDocument } from '@/lib/document-emit'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → lista de solicitudes (con estudiante y tipo). Filtro opcional ?status=
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const status = req.nextUrl.searchParams.get('status')
  let q = sb.from('document_requests')
    .select('id, status, stage_index, paid, requested_at, requirements_checked, document_url, emitted_at, field_values, program_id, student:academic_students(first_name, last_name, second_last_name, document_number), type:document_types(name, price, currency, stages, simplecert_project_id)')
    .order('requested_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data } = await q
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    id: r.id, status: r.status, stage_index: r.stage_index ?? 0, paid: r.paid, requested_at: r.requested_at,
    requirements_checked: r.requirements_checked ?? [], document_url: r.document_url, emitted_at: r.emitted_at,
    field_values: r.field_values ?? {},
    student_name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    document_number: r.student?.document_number ?? null,
    type_name: r.type?.name ?? '—', price: r.type?.price ?? 0, currency: r.type?.currency ?? 'USD',
    stages: r.type?.stages ?? [], stages_count: (r.type?.stages ?? []).length,
    has_simplecert: !!r.type?.simplecert_project_id,
  }))
  return NextResponse.json({ requests: rows })
}

// POST → crear solicitud (verifica requisitos, crea cargo si tiene costo)
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null)
  if (!b?.student_id || !b?.document_type_id) return NextResponse.json({ error: 'Falta estudiante o tipo' }, { status: 400 })

  const sb = db()
  const { data: type } = await sb.from('document_types').select('*').eq('id', b.document_type_id).maybeSingle()
  if (!type) return NextResponse.json({ error: 'Tipo de documento no encontrado' }, { status: 404 })

  const programId = b.program_id || null
  const checks = await checkRequirements(b.student_id, programId, type.requirements ?? [])
  const blocked = hasBlockingFailure(checks)

  let status: string
  let charge_external_id: string | null = null

  if (blocked) {
    status = 'rejected'
  } else if (Number(type.price) > 0) {
    // Crear cargo en el estado de cuenta
    const { data: enr } = await sb.from('academic_student_enrollments')
      .select('id, convocatoria_id').eq('student_id', b.student_id).eq('program_id', programId).maybeSingle()
    charge_external_id = crypto.randomUUID()
    const today = new Date().toISOString().slice(0, 10) // fecha de la solicitud = vencimiento
    const { error: chErr } = await sb.from('account_charges').insert({
      external_id: charge_external_id, student_id: b.student_id, enrollment_id: enr?.id ?? null,
      convocatoria_id: enr?.convocatoria_id ?? null, amount: Number(type.price), due_date: today,
      charge_type: type.charge_concept ?? null, source: 'erp',
    })
    if (chErr) return NextResponse.json({ error: 'Error al crear el cargo: ' + chErr.message }, { status: 500 })
    status = 'payment'
  } else {
    status = (type.stages ?? []).length > 0 ? 'in_progress' : 'ready'
  }

  const { data: reqRow, error } = await sb.from('document_requests').insert({
    student_id: b.student_id, document_type_id: b.document_type_id, program_id: programId,
    status, requested_by: `admin:${user.id}`, charge_external_id,
    requirements_checked: checks,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-emisión: gratuito, sin etapas y con SimpleCert configurado → emite el PDF de inmediato.
  let document_url: string | null = null
  if (status === 'ready' && type.simplecert_project_id) {
    const res = await emitDocument(reqRow.id)
    if (res.ok) { status = 'delivered'; document_url = res.url ?? null }
  }

  return NextResponse.json({ ok: true, id: reqRow.id, status, checks, blocked, document_url })
}

// DELETE ?id= → borra una solicitud NO pagada (y su cargo asociado)
export async function DELETE(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const sb = db()
  const { data: reqRow } = await sb.from('document_requests')
    .select('id, paid, charge_external_id').eq('id', id).maybeSingle()
  if (!reqRow) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  if (reqRow.paid) return NextResponse.json({ error: 'No se puede borrar una solicitud pagada' }, { status: 400 })

  // Borra el cargo asociado (solo si no tiene pagos registrados)
  if (reqRow.charge_external_id) {
    const { data: pays } = await sb.from('account_payments')
      .select('id', { count: 'exact', head: false }).eq('charge_external_id', reqRow.charge_external_id).limit(1)
    if ((pays ?? []).length > 0) return NextResponse.json({ error: 'El cargo ya tiene pagos; no se puede borrar' }, { status: 400 })
    await sb.from('account_charges').delete().eq('external_id', reqRow.charge_external_id)
  }

  const { error } = await sb.from('document_requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
