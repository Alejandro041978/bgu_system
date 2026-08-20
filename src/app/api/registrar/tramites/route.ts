import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isStudentUser } from '@/lib/student-identity'
import { createTramiteRequest } from '@/lib/tramites'
import { recomputeSituations } from '@/lib/withdrawals'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Los estudiantes tienen sesión de Supabase: "hay usuario" no alcanza para una
// cola de gestión donde se ven los trámites de todos.
async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// GET ?status= → cola de trámites + catálogo + conteos por estado
export async function GET(req: NextRequest) {
  const g = await requireStaff()
  if (g.error) return g.error
  const sb = db()
  const status = req.nextUrl.searchParams.get('status')

  let q = sb.from('tramite_requests')
    .select('id, status, requested_at, paid_at, attended_at, attended_by, resolution_note, request_note, charge_external_id, ' +
      'student:academic_students(first_name, last_name, second_last_name, document_number, email), ' +
      'type:tramite_types(name, price, currency, reincorporates)')
    .order('requested_at', { ascending: false })
  if (status && status !== 'todos') q = q.eq('status', status)
  const { data, error } = await q.limit(400)
  if (error) return NextResponse.json({ error: 'Falta correr supabase/tramites.sql: ' + error.message }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    id: r.id, status: r.status, requested_at: r.requested_at, paid_at: r.paid_at,
    attended_at: r.attended_at, attended_by: r.attended_by, resolution_note: r.resolution_note,
    request_note: r.request_note, charge_external_id: r.charge_external_id,
    student_name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    document_number: r.student?.document_number ?? null,
    email: r.student?.email ?? null,
    type_name: r.type?.name ?? '—', price: r.type?.price ?? 0, currency: r.type?.currency ?? 'USD',
    // La pantalla necesita saberlo para nombrar el botón: atender un Re-entry
    // no es "marcar atendido", es reincorporar a alguien.
    reincorporates: !!r.type?.reincorporates,
  }))

  const { data: todos } = await sb.from('tramite_requests').select('status')
  const counts: Record<string, number> = { iniciado: 0, pagado: 0, atendido: 0, anulado: 0 }
  for (const r of (todos ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1

  const { data: types } = await sb.from('tramite_types')
    .select('id, name, price, currency, active, request_note_label').order('name')

  return NextResponse.json({ rows, counts, types: types ?? [] })
}

// POST → un administrativo solicita el trámite en nombre del estudiante
// (el que se acerca en persona o escribe al helpdesk).
export async function POST(req: NextRequest) {
  const g = await requireStaff()
  if (g.error) return g.error
  const b = await req.json().catch(() => null) as
    { student_id?: string; tramite_type_id?: string; request_note?: string } | null
  if (!b?.student_id || !b?.tramite_type_id) {
    return NextResponse.json({ error: 'Falta estudiante o trámite' }, { status: 400 })
  }
  const res = await createTramiteRequest({
    studentId: b.student_id, tramiteTypeId: b.tramite_type_id,
    requestNote: b.request_note ?? null, requestedBy: `admin:${g.user!.email ?? g.user!.id}`,
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.code ?? 500 })
  return NextResponse.json({ ok: true, id: res.id, status: res.status, charge: res.charge })
}

// PATCH { id, action: 'atender' | 'anular', resolution_note }
export async function PATCH(req: NextRequest) {
  const g = await requireStaff()
  if (g.error) return g.error
  const b = await req.json().catch(() => null) as
    { id?: string; action?: string; resolution_note?: string } | null
  if (!b?.id || !['atender', 'anular'].includes(b.action ?? '')) {
    return NextResponse.json({ error: 'id y action (atender|anular) requeridos' }, { status: 400 })
  }
  const sb = db()
  const { data: r } = await sb.from('tramite_requests')
    .select('id, status, charge_external_id, tramite_type_id, student_id').eq('id', b.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Trámite no encontrado' }, { status: 404 })
  const now = new Date().toISOString()

  if (b.action === 'atender') {
    if (r.status === 'atendido') return NextResponse.json({ error: 'Ya está atendido' }, { status: 409 })
    if (r.status === 'anulado') return NextResponse.json({ error: 'Está anulado: no se puede atender' }, { status: 409 })
    // Atender un trámite impago dejaría el cobro huérfano y sin quien lo
    // reclame: el pago es parte del trámite, no un trámite aparte.
    if (r.status === 'iniciado') {
      return NextResponse.json({ error: 'Todavía no está pagado. Aparecerá en "Pagados" cuando se concilie el pago.' }, { status: 409 })
    }
    // Un trámite que reincorpora (hoy, Re-entry) tiene que cerrar el retiro.
    //
    // Va por bandera del catálogo y no por el nombre del trámite: mañana habrá
    // otro que también reincorpore y no debería hacer falta un despliegue.
    //
    // Y ES LA ÚNICA VÍA. Reincorporar a alguien de un retiro definitivo cuesta
    // 35 dólares y se pide como trámite; el botón manual de la pantalla de
    // Retiros se retiró justamente para que no hubiera una puerta que saltara el
    // pago. Por eso aquí se EXIGE el retiro vigente en vez de dejarlo pasar: sin
    // él, atender este trámite no reincorpora a nadie y lo dejaría cerrado sin
    // que nadie se entere.
    const { data: tipo } = await sb.from('tramite_types')
      .select('reincorporates, name').eq('id', r.tramite_type_id).maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let vigentes: any[] = []
    if (tipo?.reincorporates) {
      if (!r.student_id) {
        return NextResponse.json({ error: 'Este trámite reincorpora, pero no tiene estudiante asociado.' }, { status: 409 })
      }
      const { data } = await sb.from('student_withdrawals')
        .select('id, type, resolution_number, withdrawal_date, note')
        .eq('student_id', r.student_id).eq('status', 'vigente')
      vigentes = data ?? []
      if (!vigentes.length) {
        return NextResponse.json({
          error: 'Este estudiante no tiene ningún retiro vigente que levantar. Revisa su expediente en Retiros antes de atender el trámite.',
        }, { status: 409 })
      }
    }

    const { error } = await sb.from('tramite_requests').update({
      status: 'atendido', attended_at: now, updated_at: now,
      attended_by: g.user!.email ?? g.user!.id,
      resolution_note: b.resolution_note?.trim() || null,
    }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const cerrados: string[] = []
    for (const w of vigentes) {
      // Queda escrito de dónde salió la reincorporación. Sin esto, dentro de un
      // año el retiro figura levantado y nada dice que hubo un trámite pagado.
      const nota = [w.note, `Reincorporado ${now.slice(0, 10)} por trámite ${tipo?.name ?? 'de reincorporación'} (pagado)`]
        .filter(Boolean).join(' · ')
      const { error: e } = await sb.from('student_withdrawals')
        .update({
          status: 'reincorporado', note: nota,
          // El enlace estructural, no solo la nota: qué trámite y qué cuota
          // pagada levantaron ESTE retiro. Con dos IW y dos Re-entry en el
          // mismo expediente, el texto no distingue cuál fue de cuál.
          reincorporated_at: now.slice(0, 10),
          reincorporated_tramite_id: r.id,
          reincorporated_charge_external_id: r.charge_external_id ?? null,
        }).eq('id', w.id)
      if (!e) cerrados.push(`${w.type} ${w.resolution_number ?? w.withdrawal_date}`)
    }

    // La situación se DERIVA de los retiros vigentes, así que hay que
    // recalcularla o el estudiante sigue figurando retirado hasta el cron
    // nocturno: fuera de la campaña de retención y exento de completar su malla.
    // Nueve rutas del ERP ya lo hacían tras tocar un retiro; ésta no.
    if (cerrados.length) await recomputeSituations(sb).catch(() => null)

    return NextResponse.json({ ok: true, status: 'atendido', reincorporados: cerrados.length, cerrados })
  }

  // anular
  if (r.status === 'atendido') return NextResponse.json({ error: 'Ya fue atendido: no se puede anular' }, { status: 409 })
  let cuota_borrada = false
  if (r.charge_external_id) {
    // Una cuota con pagos NO se borra: primero hay que resolver el dinero.
    const { count } = await sb.from('account_payments')
      .select('id', { count: 'exact', head: true }).eq('charge_external_id', r.charge_external_id)
    if ((count ?? 0) > 0) {
      return NextResponse.json({
        error: 'La cuota de este trámite ya tiene pagos: resuelve el reembolso o desenlaza el pago antes de anular.',
      }, { status: 409 })
    }
    await sb.from('account_charges').delete().eq('external_id', r.charge_external_id)
    cuota_borrada = true
  }
  const { error } = await sb.from('tramite_requests').update({
    status: 'anulado', updated_at: now,
    resolution_note: b.resolution_note?.trim() || null,
    attended_by: g.user!.email ?? g.user!.id,
  }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: 'anulado', cuota_borrada })
}
