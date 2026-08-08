import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// GET ?status= → bandeja de solicitudes de cashpay
export async function GET(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const sb = db()
  const status = req.nextUrl.searchParams.get('status') ?? 'pendiente'
  let q = sb.from('cashpay_requests').select('*').order('requested_at', { ascending: false }).limit(300)
  if (status !== 'todas') q = q.eq('status', status)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = [...new Set((data ?? []).map((r: { student_id: string }) => r.student_id))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stu = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data: ss } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, email').in('id', ids.slice(i, i + 300))
    for (const s of ss ?? []) stu.set(s.id, s)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => {
    const s = stu.get(r.student_id)
    return { ...r, nombre: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : '(sin estudiante)', documento: s?.document_number ?? null, email: s?.email ?? null }
  })
  return NextResponse.json({ solicitudes: rows })
}

// POST { id, action: 'aprobar'|'rechazar', note? }
// Aprobar APLICA el descuento: una fila serie DESCUENTO por cuota, prorrateando
// el ahorro. No se toca el monto de las cuotas — el descuento es trazable y
// reversible, igual que cualquier otro del estado de cuenta.
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const user = g.user
  const b = await req.json().catch(() => null) as { id?: string; action?: string; note?: string } | null
  if (!b?.id || !['aprobar', 'rechazar', 'revertir'].includes(b.action ?? '')) {
    return NextResponse.json({ error: 'Falta id o acción' }, { status: 400 })
  }
  const sb = db()
  const { data: r } = await sb.from('cashpay_requests').select('*').eq('id', b.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

  if (b.action === 'revertir') return revertir(sb, r, b.note, user.email ?? user.id)
  if (r.status !== 'pendiente') return NextResponse.json({ error: `La solicitud ya está ${r.status}` }, { status: 409 })

  const now = new Date().toISOString()
  if (b.action === 'rechazar') {
    await sb.from('cashpay_requests').update({
      status: 'rechazada', reviewed_by: user.email ?? user.id, reviewed_at: now, review_note: b.note?.trim() || null,
    }).eq('id', b.id)
    return NextResponse.json({ ok: true, status: 'rechazada' })
  }

  // Recalcular el saldo REAL de cada cuota: entre la solicitud y la aprobación
  // el estudiante pudo pagar alguna.
  const charges: string[] = Array.isArray(r.charges) ? r.charges : []
  const { data: cs } = await sb.from('account_charges').select('external_id, amount, student_id').in('external_id', charges)
  const { data: ps } = await sb.from('account_payments').select('charge_external_id, amount').in('charge_external_id', charges)
  const pagado = new Map<string, number>()
  for (const p of ps ?? []) pagado.set(p.charge_external_id, (pagado.get(p.charge_external_id) ?? 0) + Number(p.amount || 0))
  const vivos = (cs ?? []).map((c: { external_id: string; amount: number }) => ({
    external_id: c.external_id, saldo: Math.round((Number(c.amount || 0) - (pagado.get(c.external_id) ?? 0)) * 100) / 100,
  })).filter((c: { saldo: number }) => c.saldo > 0.005)
  if (!vivos.length) return NextResponse.json({ error: 'Las cuotas de la solicitud ya están saldadas' }, { status: 409 })

  const base = Math.round(vivos.reduce((s: number, c: { saldo: number }) => s + c.saldo, 0) * 100) / 100
  const pct = Number(r.discount_pct)
  const beneficio = Math.round(base * pct) / 100
  const neto = Math.round((base - beneficio) * 100) / 100
  const code = `CASHPAY-${String(b.id).slice(0, 6).toUpperCase()}`

  // ── Cashpay = BONO de monto fijo + UNA cuota por el neto ───────────────────
  //
  // Antes se prorrateaba un descuento por cuota. Dos problemas: el redondeo por
  // cuota se acumulaba (24 × 22.12 = 530.88 cuando lo aprobado eran 530.78), y
  // el estudiante seguía viendo 24 vencimientos cuando justamente había
  // aceptado pagar una sola vez.
  //
  // El bono va como MONTO, no como porcentaje: el porcentaje se calcula sobre
  // las cuotas adelantadas, y si se guardara como % de la tuition completa
  // habría que derivarlo — y ese derivado flota si mañana cambia la beca o una
  // convalidación.
  const { data: enr } = await sb.from('account_charges')
    .select('enrollment_id, convocatoria_id, charge_type').eq('external_id', vivos[0].external_id).maybeSingle()

  const { error: bErr } = await sb.from('bonuses').insert({
    student_id: r.student_id,
    enrollment_id: enr?.enrollment_id ?? null,
    amount: beneficio,
    percentage: null,
    reason: 'Cash Pay',
    granted_at: now.slice(0, 10),
    granted_by: user.email ?? user.id,
  })
  if (bErr) return NextResponse.json({ error: 'No se pudo crear el bono: ' + bErr.message }, { status: 500 })

  // La cuota única vence cuando caduca el beneficio: es lo que se aceptó — pagar
  // ya a cambio del descuento.
  const vence = r.expires_at ? String(r.expires_at).slice(0, 10) : now.slice(0, 10)
  const nueva = crypto.randomUUID()
  const { error: cErr } = await sb.from('account_charges').insert({
    external_id: nueva, student_id: r.student_id,
    enrollment_id: enr?.enrollment_id ?? null, convocatoria_id: enr?.convocatoria_id ?? null,
    amount: neto, due_date: vence, charge_type: enr?.charge_type ?? null,
    source: 'erp', is_initial: false,
  })
  if (cErr) return NextResponse.json({ error: 'No se pudo crear la cuota única: ' + cErr.message }, { status: 500 })

  // Fotografía de lo que se va a borrar. Sin ella, revertir el cashpay sería
  // adivinar: las cuotas originales dejan de existir y la solicitud pasa a
  // apuntar a la cuota nueva.
  const { data: fotos } = await sb.from('account_charges')
    .select('external_id, student_id, enrollment_id, convocatoria_id, amount, due_date, charge_type, source, is_initial')
    .in('external_id', vivos.map((c: { external_id: string }) => c.external_id))

  // Se borran DESPUÉS de crear lo nuevo: si algo falla, el estudiante conserva
  // su plan anterior en vez de quedarse sin cuotas.
  const aBorrar = vivos.map((c: { external_id: string }) => c.external_id)
  const { error: dErr } = await sb.from('account_charges').delete().in('external_id', aBorrar)
  if (dErr) {
    await sb.from('account_charges').delete().eq('external_id', nueva)
    return NextResponse.json({ error: 'No se pudieron reemplazar las cuotas: ' + dErr.message }, { status: 500 })
  }

  const cierre = {
    status: 'aprobada', reviewed_by: user.email ?? user.id, reviewed_at: now,
    review_note: b.note?.trim() || null, applied_at: now,
    // La solicitud pasa a apuntar a la cuota que la materializa, no a las que
    // ya no existen.
    charges: [nueva],
    gross_amount: base, discount_amount: beneficio, net_amount: neto,
  }
  // La fotografía sólo existe si se corrió cashpay_revert.sql. Si no está, la
  // aprobación NO puede quedarse a medias: las cuotas ya se reemplazaron y una
  // solicitud que siguiera 'pendiente' invitaría a aprobarla otra vez.
  const { error: uErr } = await sb.from('cashpay_requests')
    .update({ ...cierre, replaced_charges: fotos ?? [] }).eq('id', b.id)
  if (uErr) {
    const { error: u2 } = await sb.from('cashpay_requests').update(cierre).eq('id', b.id)
    if (u2) return NextResponse.json({ error: 'Se aplicó el cashpay pero no se pudo cerrar la solicitud: ' + u2.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true, status: 'aprobada', reemplazadas: aBorrar.length,
    bono: beneficio, neto, vence, codigo: code,
  })
}

// ---------------------------------------------------------------------------
// REVERTIR un cashpay aprobado.
//
// El estudiante cambió su plan en cuotas por un pago único a cambio de un
// descuento, y después avisa que no puede cumplirlo. Deshacerlo es exactamente
// lo contrario de aprobarlo, en orden inverso:
//   1. vuelven sus cuotas (la fotografía que guardó la aprobación)
//   2. desaparece la cuota única
//   3. desaparece el bono de descuento — sin esto seguiría cobrándose un
//      beneficio que ya no tiene contraprestación
//
// Se niega si la cuota única tiene pagos: ahí ya no es una reversión sino una
// devolución, y eso lo decide alguien, no un botón.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function revertir(sb: any, r: any, note: string | undefined, quien: string) {
  if (r.status !== 'aprobada') {
    return NextResponse.json({ error: `Solo se revierte un cashpay aprobado (éste está ${r.status})` }, { status: 409 })
  }

  const actuales: string[] = Array.isArray(r.charges) ? r.charges : []
  const { data: pagos } = await sb.from('account_payments')
    .select('charge_external_id, amount, series_code').in('charge_external_id', actuales)
  const cobrado = (pagos ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount || 0), 0)
  if (cobrado > 0.005) {
    return NextResponse.json({
      error: `La cuota del cashpay ya tiene ${cobrado.toFixed(2)} pagados. Revertirlo dejaría un pago sin cuota: resuélvelo primero en el estado de cuenta.`,
    }, { status: 409 })
  }

  // 1. Reponer las cuotas. Con fotografía, tal cual estaban —mismo external_id,
  //    mismo vencimiento—. Sin ella (aprobaciones anteriores a que se guardara),
  //    una sola cuota por el bruto, con el vencimiento más lejano que se
  //    adelantó: la deuda queda correcta y el plan se rehace con Refacturar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto: any[] = Array.isArray(r.replaced_charges) ? r.replaced_charges : []
  let repuestas = foto.length
  let aproximada = false
  if (foto.length) {
    const { error } = await sb.from('account_charges').upsert(foto, { onConflict: 'external_id' })
    if (error) return NextResponse.json({ error: 'No se pudieron reponer las cuotas: ' + error.message }, { status: 500 })
  } else {
    const { data: ref } = await sb.from('account_charges')
      .select('student_id, enrollment_id, convocatoria_id, charge_type').eq('external_id', actuales[0]).maybeSingle()
    const desde = new Date(r.requested_at)
    desde.setDate(desde.getDate() + Math.round(Number(r.months || 0) * 30.4375))
    const { error } = await sb.from('account_charges').insert({
      external_id: crypto.randomUUID(),
      student_id: r.student_id,
      enrollment_id: ref?.enrollment_id ?? null,
      convocatoria_id: ref?.convocatoria_id ?? null,
      amount: Number(r.gross_amount),
      due_date: desde.toISOString().slice(0, 10),
      charge_type: ref?.charge_type ?? null,
      source: 'erp', is_initial: false,
    })
    if (error) return NextResponse.json({ error: 'No se pudo reponer la deuda: ' + error.message }, { status: 500 })
    repuestas = 1
    aproximada = true
  }

  // 2. Fuera la cuota única (después de reponer: si algo falla, el estudiante
  //    nunca se queda sin ninguna cuota).
  const sobrantes = actuales.filter(id => !foto.some((f: { external_id: string }) => f.external_id === id))
  if (sobrantes.length) await sb.from('account_charges').delete().in('external_id', sobrantes)

  // 3. Fuera el bono. Se busca por importe y motivo dentro del estudiante: la
  //    tabla de bonos no guarda de qué solicitud vino.
  const { data: bonos } = await sb.from('bonuses')
    .select('id, amount, granted_at, created_at').eq('student_id', r.student_id).eq('reason', 'Cash Pay')
  const objetivo = Number(r.discount_amount)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatos = (bonos ?? []).filter((x: any) => Math.abs(Number(x.amount) - objetivo) < 0.02)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elegido = candidatos.sort((a: any, b: any) =>
    Math.abs(new Date(a.created_at ?? a.granted_at).getTime() - new Date(r.applied_at ?? r.reviewed_at).getTime())
    - Math.abs(new Date(b.created_at ?? b.granted_at).getTime() - new Date(r.applied_at ?? r.reviewed_at).getTime()))[0]
  if (elegido) await sb.from('bonuses').delete().eq('id', elegido.id)

  const now = new Date().toISOString()
  await sb.from('cashpay_requests').update({
    status: 'anulada',
    reviewed_by: quien, reviewed_at: now,
    review_note: note?.trim() || 'Revertido: el estudiante no pudo cumplir el pago único',
    charges: foto.map((f: { external_id: string }) => f.external_id),
  }).eq('id', r.id)

  return NextResponse.json({
    ok: true, status: 'anulada',
    cuotas_repuestas: repuestas,
    bono_eliminado: elegido ? Number(elegido.amount) : null,
    aproximada,
  })
}
