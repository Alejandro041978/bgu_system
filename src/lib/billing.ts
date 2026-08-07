import { plantillaDe, inicioDeClases, primeraCuota, vencimientoCuota } from '@/lib/billing-template'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Vencimiento de la cuota i (0-based) a partir de first_due_date, respetando due_day (clamp a fin de mes).
export function dueDate(first: string, i: number, dueDay: number | null): string {
  const [y, m, d] = first.split('-').map(Number)
  const day = dueDay ?? d
  const target = new Date(Date.UTC(y, m - 1 + i, 1))
  const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, daysInMonth))
  return target.toISOString().slice(0, 10)
}

/**
 * Genera las cuotas de una matrícula desde la plantilla (programa + convocatoria).
 * Idempotente: si la matrícula ya tiene cuotas, no hace nada.
 */
export async function generateChargesForEnrollment(
  enrollmentId: string
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const sb = admin()

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, program_id, convocatoria_id, collection_id')
    .eq('id', enrollmentId).maybeSingle()
  if (!enr) return { ok: false, error: 'Matrícula no encontrada' }
  if (!enr.convocatoria_id) return { ok: false, error: 'La matrícula no tiene convocatoria' }

  // Idempotencia: no regenerar si ya tiene cuotas
  const { count } = await sb.from('account_charges')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enr.id)
  if ((count ?? 0) > 0) return { ok: false, error: 'La matrícula ya tiene cuotas generadas' }

  // La plantilla la da el PROGRAMA (o su categoría), no la convocatoria. De la
  // convocatoria sale una sola cosa: el inicio de clases, del que se calcula el
  // primer vencimiento.
  const plan = await plantillaDe(sb, enr.program_id, enr.collection_id ?? null)
  if (!plan) {
    return { ok: false, error: 'No hay plantilla de facturación para este programa ni para su categoría' }
  }
  const inicio = await inicioDeClases(sb, enr.convocatoria_id)
  if (!inicio && Number(plan.installments_count) > 0) {
    return { ok: false, error: 'La convocatoria no tiene fecha de inicio de clases: sin ella no se pueden fechar las cuotas' }
  }
  const primera = inicio ? primeraCuota(inicio) : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  const base = {
    student_id: enr.student_id, enrollment_id: enr.id, convocatoria_id: enr.convocatoria_id, source: 'erp',
  }

  if (Number(plan.registration_fee) > 0) {
    rows.push({
      ...base, external_id: crypto.randomUUID(),
      amount: Number(plan.registration_fee), due_date: null, charge_type: plan.registration_concept ?? null,
      is_initial: true,   // concepto inicial: su pago activa la matrícula
    })
  }

  const n = Number(plan.installments_count) || 0
  if (n > 0 && Number(plan.installment_amount) > 0 && primera) {
    for (let i = 0; i < n; i++) {
      rows.push({
        ...base, external_id: crypto.randomUUID(),
        amount: Number(plan.installment_amount),
        // Todas vencen el día 1: la primera se calcula del inicio de clases y
        // las demás la siguen mes a mes.
        due_date: vencimientoCuota(primera, i),
        charge_type: plan.installment_concept ?? null,
        // explícito: en inserts masivos PostgREST manda null si la clave falta
        is_initial: false,
      })
    }
  }

  if (rows.length === 0) return { ok: false, error: 'La plantilla no define montos' }

  const { error } = await sb.from('account_charges').insert(rows)
  if (error) return { ok: false, error: error.message }
  return { ok: true, created: rows.length }
}

// ───────────────────────────────────────────────────────────────────────────
// Refacturación: cambiar el plan de cuotas de una matrícula de una sola vez
// ───────────────────────────────────────────────────────────────────────────
// El caso real: la plantilla generó 18 cuotas de $156 y hay que pasar a otro
// esquema. Editarlas una a una son 18 oportunidades de equivocarse.
//
// Reglas que hacen esto seguro, y por qué:
//
//  · Solo se reemplazan cuotas SIN NINGÚN MOVIMIENTO. Una cuota con pago o
//    descuento no se toca nunca: borrarla dejaría el pago huérfano y el dinero
//    sin cuota a la que pertenece. Se informan y se quedan.
//  · El concepto inicial (matrícula) queda fuera. Su pago es lo que activa la
//    matrícula; regenerarlo cambiaría ese disparador.
//  · Si hay una solicitud cashpay pendiente sobre estas cuotas, se ABORTA. Esa
//    solicitud guarda los external_id: borrarlos la dejaría apuntando al vacío.
//  · Si el total cambia, hay que confirmarlo aparte. Refasear no es lo mismo que
//    cambiar lo que el estudiante debe, y confundirlos es el error caro.

export interface RebillPlan {
  concept: number | null           // type_code de la cuota a reemplazar
  installmentsCount: number
  installmentAmount: number
  firstDueDate: string             // YYYY-MM-DD
  dueDay: number | null
}
export interface RebillCharge { external_id: string; amount: number; due_date: string | null }
export interface RebillPreview {
  ok: boolean
  error?: string
  blocked?: string                 // motivo por el que no se puede continuar
  replace: RebillCharge[]          // se eliminarán
  keep: (RebillCharge & { reason: string })[]  // se conservan (tienen movimientos)
  create: { amount: number; due_date: string }[]
  totalReplaced: number
  totalNew: number
  // Total Tuition que resulta de precio oficial, convalidaciones, beca y bono.
  // Es el objetivo de verdad: cuando se otorga una beca nueva, el plan DEBE
  // dejar de coincidir con las cuotas viejas y pasar a coincidir con esto.
  tuitionTarget?: number | null
  scholarshipPct?: number | null
  matchesTarget?: boolean
  applied?: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function rebillEnrollment(opts: {
  enrollmentId: string
  plan: RebillPlan
  apply: boolean                   // false = solo vista previa
  allowTotalChange?: boolean
}): Promise<RebillPreview> {
  const sb = admin()
  const vacio: RebillPreview = { ok: false, replace: [], keep: [], create: [], totalReplaced: 0, totalNew: 0 }

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, convocatoria_id').eq('id', opts.enrollmentId).maybeSingle()
  if (!enr) return { ...vacio, error: 'Matrícula no encontrada' }

  const n = Number(opts.plan.installmentsCount) || 0
  const monto = round2(Number(opts.plan.installmentAmount) || 0)
  if (n <= 0) return { ...vacio, error: 'Indica cuántas cuotas' }
  if (n > 120) return { ...vacio, error: 'Demasiadas cuotas (máximo 120)' }
  if (monto <= 0) return { ...vacio, error: 'Indica el monto de la cuota' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.plan.firstDueDate)) return { ...vacio, error: 'Indica la fecha del primer vencimiento' }

  // Candidatas: cuotas de ese concepto en esta matrícula, sin contar la inicial.
  let q = sb.from('account_charges')
    .select('external_id, amount, due_date, is_initial, charge_type')
    .eq('enrollment_id', enr.id).or('is_initial.is.null,is_initial.eq.false')
  q = opts.plan.concept == null ? q.is('charge_type', null) : q.eq('charge_type', opts.plan.concept)
  const { data: cand } = await q
  const candidatas = (cand ?? []) as RebillCharge[]
  if (!candidatas.length) {
    return { ...vacio, error: 'Esta matrícula no tiene cuotas de ese concepto (aparte del concepto inicial, que no se reemplaza)' }
  }
  const ids = candidatas.map(c => c.external_id)

  // Movimientos: cualquier pago o descuento inmoviliza su cuota.
  const { data: pagos } = await sb.from('account_payments')
    .select('charge_external_id, amount, series_code').in('charge_external_id', ids)
  const movidas = new Map<string, { total: number; descuento: boolean }>()
  for (const p of (pagos ?? []) as { charge_external_id: string; amount: number; series_code: string | null }[]) {
    const prev = movidas.get(p.charge_external_id) ?? { total: 0, descuento: false }
    movidas.set(p.charge_external_id, {
      total: prev.total + Number(p.amount ?? 0),
      descuento: prev.descuento || p.series_code === 'DESCUENTO',
    })
  }

  // Trámites que guardan el external_id de una cuota: si borramos la cuota,
  // el trámite queda apuntando a algo que no existe.
  const { data: docs } = await sb.from('document_requests').select('charge_external_id').in('charge_external_id', ids)
  const { data: exams } = await sb.from('exam_requests').select('charge_external_id').in('charge_external_id', ids)
  const enTramite = new Set<string>([
    ...(docs ?? []).map((d: { charge_external_id: string }) => d.charge_external_id),
    ...(exams ?? []).map((e: { charge_external_id: string }) => e.charge_external_id),
  ])

  const replace: RebillCharge[] = []
  const keep: (RebillCharge & { reason: string })[] = []
  for (const c of candidatas) {
    const mov = movidas.get(c.external_id)
    if (mov && mov.total > 0.005) {
      keep.push({ ...c, reason: mov.descuento ? `tiene descuento aplicado (${mov.total.toFixed(2)})` : `tiene pagos por ${mov.total.toFixed(2)}` })
    } else if (enTramite.has(c.external_id)) {
      keep.push({ ...c, reason: 'está vinculada a una solicitud de documento o examen' })
    } else {
      replace.push(c)
    }
  }

  // Cashpay pendiente: guarda los external_id en un jsonb, así que hay que
  // mirar dentro. Aquí no se filtra, se aborta: el descuento se calculó sobre
  // estas cuotas exactas y refacturarlas por debajo lo invalida.
  const { data: cash } = await sb.from('cashpay_requests')
    .select('id, status, charges').eq('student_id', enr.student_id).eq('status', 'pendiente')
  for (const r of (cash ?? []) as { id: string; charges: unknown }[]) {
    const lista: string[] = Array.isArray(r.charges) ? r.charges as string[] : []
    if (lista.some(x => replace.some(c => c.external_id === x))) {
      return {
        ...vacio, replace, keep,
        blocked: 'Hay una solicitud Cashpay pendiente sobre estas cuotas. Resuélvela (aprobar o rechazar) antes de refacturar: su descuento se calculó sobre las cuotas actuales.',
      }
    }
  }

  if (!replace.length) {
    return { ...vacio, keep, error: 'Ninguna cuota se puede reemplazar: todas tienen pagos, descuentos o trámites vinculados' }
  }

  const totalReplaced = round2(replace.reduce((s, c) => s + Number(c.amount ?? 0), 0))
  const totalNew = round2(n * monto)
  const create = Array.from({ length: n }, (_, i) => ({
    amount: monto, due_date: dueDate(opts.plan.firstDueDate, i, opts.plan.dueDay),
  }))

  // Objetivo: el Total Tuition que sale del precio oficial menos
  // convalidaciones, beca y bono. Se reusa getAccountStatement en vez de
  // recalcularlo aquí: es la misma cuenta que ve el usuario en la cabecera, y
  // duplicar la fórmula sería garantizar que algún día no coincidan.
  let tuitionTarget: number | null = null
  let scholarshipPct: number | null = null
  try {
    const { getAccountStatement, computeTuition } = await import('./account-statement')
    const st = await getAccountStatement({ studentId: enr.student_id })
    const acc = st.programs.find(p => p.enrollment_id === enr.id)
    if (acc) {
      scholarshipPct = acc.scholarship_pct ?? null
      tuitionTarget = computeTuition(acc)?.total ?? null
    }
  } catch { /* sin tarifario congelado no hay objetivo: se cae al total anterior */ }

  // Lo que quedará facturado de este concepto: lo que se conserva + el plan nuevo.
  const totalKeptSameConcept = round2(keep.reduce((s, c) => s + Number(c.amount ?? 0), 0))
  const quedará = round2(totalKeptSameConcept + totalNew)
  const matchesTarget = tuitionTarget != null && Math.abs(quedará - tuitionTarget) <= 0.005

  const preview: RebillPreview = {
    ok: true, replace, keep, create, totalReplaced, totalNew,
    tuitionTarget, scholarshipPct, matchesTarget,
  }
  if (!opts.apply) return preview

  // El plan puede cambiar el total por dos motivos muy distintos:
  //  · un error de tecleo → hay que frenarlo;
  //  · una beca nueva → es justamente el objetivo.
  // Por eso no se compara solo contra las cuotas viejas: si el plan cuadra con
  // el Total Tuition vigente, no se pide nada. Solo cuando no cuadra con
  // ninguna de las dos referencias hace falta confirmar a mano.
  const igualQueAntes = Math.abs(totalNew - totalReplaced) <= 0.005
  if (!igualQueAntes && !matchesTarget && !opts.allowTotalChange) {
    const refBeca = tuitionTarget != null
      ? ` El Total Tuition vigente${scholarshipPct != null ? ` (con beca del ${scholarshipPct}%)` : ''} es ${tuitionTarget.toFixed(2)}, y con este plan quedaría facturado ${quedará.toFixed(2)}.`
      : ''
    return {
      ...preview, ok: false,
      blocked: `El plan nuevo suma ${totalNew.toFixed(2)} y las cuotas que reemplaza suman ${totalReplaced.toFixed(2)}.${refBeca} Si el cambio es intencional, confírmalo marcando la casilla.`,
    }
  }

  // Se crea antes de borrar: si el insert falla, el estudiante se queda con su
  // plan anterior intacto en vez de sin cuotas.
  const nuevas = create.map(c => ({
    external_id: crypto.randomUUID(),
    student_id: enr.student_id, enrollment_id: enr.id, convocatoria_id: enr.convocatoria_id,
    amount: c.amount, due_date: c.due_date,
    charge_type: opts.plan.concept ?? null, source: 'erp', is_initial: false,
  }))
  const { error: insErr } = await sb.from('account_charges').insert(nuevas)
  if (insErr) return { ...preview, ok: false, error: 'No se pudieron crear las cuotas nuevas: ' + insErr.message }

  const { error: delErr } = await sb.from('account_charges')
    .delete().in('external_id', replace.map(c => c.external_id))
  if (delErr) {
    // Deshacer lo insertado para no dejar el plan duplicado.
    await sb.from('account_charges').delete().in('external_id', nuevas.map(c => c.external_id))
    return { ...preview, ok: false, error: 'No se pudieron eliminar las cuotas anteriores: ' + delErr.message }
  }

  return { ...preview, applied: true }
}
