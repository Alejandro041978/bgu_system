// ---------------------------------------------------------------------------
// Gestor de IW y Re-Entry (reglas del usuario, 20/08/2026).
//
// Cuando ocurre un IW, el estudiante se queda solo con lo que CURSÓ: las
// asignaturas sin participación salen del registro curricular, el tuition se
// recalcula con los créditos que quedan, y el plan de pagos se ajusta — una
// sola cuota con el saldo si debe, ninguna impaga si no debe. Cuando vuelve
// con un Re-Entry pagado, el camino inverso: lo desaprobado y lo retirado se
// registra de nuevo con la marca reentry, y la diferencia de tuition es una
// cuota con vencimiento el día del pago.
//
// NADA se aplica sin autorización: este módulo detecta los casos, arma la
// vista previa completa, y solo escribe cuando alguien la aprueba en la
// pantalla. La foto de lo autorizado queda en iw_reentry_gestiones — es la
// auditoría y el deshacer, con las filas previas completas.
//
// El tuition NO se calcula aquí: se reutiliza computeTuition, el mismo motor
// del estado de cuenta. Si el gestor y el estado de cuenta dijeran números
// distintos, nadie sabría cuál creer.
// ---------------------------------------------------------------------------
import { randomUUID } from 'crypto'
import { getAccountStatement, computeTuition, type ProgramAccount } from './account-statement'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any
const r2 = (n: number) => Math.round(n * 100) / 100
const CHARGE_TUITION = 2

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: SB, tabla: string, cols: string, filtro?: (q: any) => any, orden = 'id'): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(tabla).select(cols).order(orden).range(from, from + 999)
    if (filtro) q = filtro(q)
    const { data, error } = await q
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

export interface Caso {
  kind: 'IW' | 'REENTRY'
  trigger_id: string
  student_id: string
  student_name: string
  document_number: string | null
  fecha: string | null          // fecha del retiro / del pago del trámite
  detalle: string               // resolución del IW / referencia del pago
}

// ── La cola: casos sin gestión ──────────────────────────────────────────────
export async function casosPendientes(sb: SB): Promise<Caso[]> {
  // Si la migración aún no corrió, la cola funciona igual (nada gestionado
  // todavía); aplicar sí exigirá la tabla, con su error a la vista.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let gestiones: any[] = []
  try { gestiones = await todo(sb, 'iw_reentry_gestiones', 'kind, trigger_id') } catch { /* tabla sin migrar */ }
  const hechas = new Set(gestiones.map(g => `${g.kind}|${g.trigger_id}`))

  const wds = await todo(sb, 'student_withdrawals',
    'id, student_id, type, status, resolution_number, withdrawal_date, converted_to_id',
    q => q.eq('type', 'IW').eq('status', 'vigente'))

  const { data: tipos } = await sb.from('tramite_types').select('id').eq('reincorporates', true)
  const reentryTypes = (tipos ?? []).map((t: { id: string }) => String(t.id))
  const tramites = reentryTypes.length
    ? await todo(sb, 'tramite_requests', 'id, student_id, status, paid_at, charge_external_id',
      q => q.in('tramite_type_id', reentryTypes).not('paid_at', 'is', null))
    : []

  const sids = [...new Set([...wds.map(w => String(w.student_id)), ...tramites.map(t => String(t.student_id))])]
  const nombres = new Map<string, { name: string; doc: string | null }>()
  for (let i = 0; i < sids.length; i += 150) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number').in('id', sids.slice(i, i + 150))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (data ?? []) as any[]) {
      nombres.set(String(e.id), {
        name: [e.first_name, e.last_name, e.second_last_name].filter(Boolean).join(' '),
        doc: e.document_number == null ? null : String(e.document_number),
      })
    }
  }

  const casos: Caso[] = []
  for (const w of wds) {
    if (w.converted_to_id || hechas.has(`IW|${w.id}`)) continue
    const n = nombres.get(String(w.student_id))
    casos.push({
      kind: 'IW', trigger_id: String(w.id), student_id: String(w.student_id),
      student_name: n?.name ?? '—', document_number: n?.doc ?? null,
      fecha: w.withdrawal_date ?? null, detalle: w.resolution_number ?? 'IW sin resolución',
    })
  }
  for (const t of tramites) {
    if (hechas.has(`REENTRY|${t.id}`)) continue
    const n = nombres.get(String(t.student_id))
    casos.push({
      kind: 'REENTRY', trigger_id: String(t.id), student_id: String(t.student_id),
      student_name: n?.name ?? '—', document_number: n?.doc ?? null,
      fecha: t.paid_at ? String(t.paid_at).slice(0, 10) : null, detalle: `Trámite Re-Entry (${t.status})`,
    })
  }
  return casos.sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')))
}

// ── Vista previa ────────────────────────────────────────────────────────────
export interface CursoCambio {
  enrollment_row_id: string
  course_id: string
  code: string | null
  name: string
  credits: number
  estado_actual: string
  accion: 'retirar' | 'reactivar' | 'nuevo_intento'
}
export interface CuotaCambio {
  external_id: string | null
  accion: 'eliminar' | 'reducir' | 'crear'
  amount: number
  nuevo_amount?: number
  due_date: string | null
  pagado?: number
}
export interface BloquePrograma {
  enrollment_id: string
  program_name: string
  cursos: CursoCambio[]
  creditos_antes: number | null
  creditos_despues: number | null
  tuition_antes: { lista: number; ahorro: number; beca: number; bonus: number; total: number } | null
  tuition_despues: { lista: number; ahorro: number; beca: number; bonus: number; total: number } | null
  tuition_pagado: number
  cuotas: CuotaCambio[]
}
export interface Preview {
  caso: Caso
  bloques: BloquePrograma[]
  sin_cambios: boolean
}

// ¿El estudiante participó en esta matrícula? Nota con valor o evaluaciones
// rendidas. Es el criterio de la liquidación de julio: filas vacías no son
// cursadas, y un "en curso" con quizzes rendidos sí lo es.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function participo(nota: any | undefined): boolean {
  if (!nota) return false
  if ((nota.retake_grade ?? nota.final_grade) != null && Number(nota.retake_grade ?? nota.final_grade) > 0) return true
  return nota.rendido_pct != null && Number(nota.rendido_pct) > 0
}

async function contexto(sb: SB, caso: Caso) {
  const statement = await getAccountStatement({ studentId: caso.student_id })
  const cuentas = statement.programs.filter(p => p.enrollment_id)
  const { data: grads } = await sb.from('student_graduations')
    .select('program_id').eq('student_id', caso.student_id)
  const terminados = new Set((grads ?? []).map((g: { program_id: string }) => String(g.program_id)))

  const mats = await todo(sb, 'academic_course_enrollments',
    'id, course_id, program_id, program_enrollment_id, attempt, status, source',
    q => q.eq('student_id', caso.student_id))
  const courseIds = [...new Set(mats.map(m => String(m.course_id)))]
  const cursos = new Map<string, { code: string | null; name: string; credits: number }>()
  for (let i = 0; i < courseIds.length; i += 200) {
    const { data } = await sb.from('academic_courses').select('id, code, name, credits').in('id', courseIds.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (data ?? []) as any[]) cursos.set(String(c.id), { code: c.code, name: c.name, credits: Number(c.credits ?? 0) })
  }
  const notas = await todo(sb, 'academic_grades',
    'course_enrollment_id, final_grade, retake_grade, rendido_pct, withdrawn_at',
    q => q.eq('document_number', String(caso.document_number ?? '')), 'external_id')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notaDe = new Map<string, any>()
  for (const n of notas) if (n.course_enrollment_id && !n.withdrawn_at) notaDe.set(String(n.course_enrollment_id), n)
  return { cuentas, terminados, mats, cursos, notaDe }
}

function planCuotas(cuenta: ProgramAccount, tuitionObjetivo: number, dueNueva: string | null): { cuotas: CuotaCambio[]; pagado: number } {
  const tuition = cuenta.charges.filter(c => c.charge_type === CHARGE_TUITION)
  const pagado = r2(tuition.reduce((s, c) => s + Number(c.paid), 0))
  const cuotas: CuotaCambio[] = []
  for (const c of tuition) {
    if (c.balance <= 0.005) continue                       // pagada: intocable
    if (c.paid > 0.005) {
      // Parcial: no se borra —dejaría huérfano su pago—; se reduce a lo pagado
      // y su saldo viaja a la cuota consolidada.
      cuotas.push({ external_id: c.external_id, accion: 'reducir', amount: c.amount, nuevo_amount: r2(c.paid), due_date: c.due_date, pagado: c.paid })
    } else {
      cuotas.push({ external_id: c.external_id, accion: 'eliminar', amount: c.amount, due_date: c.due_date })
    }
  }
  const saldo = r2(tuitionObjetivo - pagado)
  if (saldo > 0.005) cuotas.push({ external_id: null, accion: 'crear', amount: saldo, due_date: dueNueva })
  return { cuotas, pagado }
}

export async function previewCaso(sb: SB, caso: Caso): Promise<Preview> {
  const { cuentas, terminados, mats, cursos, notaDe } = await contexto(sb, caso)
  const bloques: BloquePrograma[] = []

  for (const cuenta of cuentas) {
    const enrollmentId = String(cuenta.enrollment_id)
    const delPrograma = mats.filter(m => String(m.program_enrollment_id ?? '') === enrollmentId)
    // Respaldo para registros viejos sin program_enrollment_id: por programa
    const delProgramaFinal = delPrograma.length ? delPrograma : mats.filter(m => {
      return false // sin enlace no se adivina: se informa como bloque vacío
    })
    if (terminados.size && delPrograma.length && terminados.has(String(delPrograma[0].program_id))) continue

    const cambios: CursoCambio[] = []
    if (caso.kind === 'IW') {
      for (const m of delProgramaFinal) {
        if (!['no_iniciada', 'en_curso'].includes(String(m.status))) continue
        if (participo(notaDe.get(String(m.id)))) continue
        const c = cursos.get(String(m.course_id))
        cambios.push({
          enrollment_row_id: String(m.id), course_id: String(m.course_id),
          code: c?.code ?? null, name: c?.name ?? '?', credits: c?.credits ?? 0,
          estado_actual: String(m.status), accion: 'retirar',
        })
      }
    } else {
      const maxAttempt = new Map<string, number>()
      for (const m of delProgramaFinal) {
        const k = String(m.course_id)
        maxAttempt.set(k, Math.max(maxAttempt.get(k) ?? 0, Number(m.attempt ?? 1)))
      }
      const vistos = new Set<string>()
      for (const m of delProgramaFinal) {
        const k = String(m.course_id)
        if (vistos.has(k)) continue
        // Solo el ÚLTIMO intento decide: una reprobada con recursado aprobado
        // después no se vuelve a registrar.
        if (Number(m.attempt ?? 1) !== maxAttempt.get(k)) continue
        vistos.add(k)
        const c = cursos.get(k)
        if (String(m.status) === 'retirada') {
          cambios.push({
            enrollment_row_id: String(m.id), course_id: k,
            code: c?.code ?? null, name: c?.name ?? '?', credits: c?.credits ?? 0,
            estado_actual: 'retirada', accion: 'reactivar',
          })
        } else if (String(m.status) === 'reprobada') {
          cambios.push({
            enrollment_row_id: String(m.id), course_id: k,
            code: c?.code ?? null, name: c?.name ?? '?', credits: c?.credits ?? 0,
            estado_actual: 'reprobada', accion: 'nuevo_intento',
          })
        }
      }
    }

    // Créditos: antes = los del acta (billable_credits del estado de cuenta).
    // Después = delta sobre el mismo número, con la misma semántica del acta:
    //  · retirar quita los créditos de esa asignatura;
    //  · reactivar una retirada los devuelve;
    //  · un intento nuevo sobre reprobada NO suma (la asignatura ya cuenta).
    const antes = cuenta.billable_credits
    let delta = 0
    for (const c of cambios) {
      if (c.accion === 'retirar') delta -= c.credits
      if (c.accion === 'reactivar') delta += c.credits
    }
    const despues = antes != null ? Math.max(0, antes + delta) : null

    const base = {
      credit_rate: cuenta.credit_rate, transfer_credits: cuenta.transfer_credits,
      scholarship_pct: cuenta.scholarship_pct, bonus_pct: cuenta.bonus_pct, bonus_amount: cuenta.bonus_amount,
    }
    const tuitionAntes = computeTuition({ ...base, list_price: cuenta.list_price })
    const listaDespues = cuenta.credit_rate != null && despues != null ? r2(Number(cuenta.credit_rate) * despues) : cuenta.list_price
    const tuitionDespues = computeTuition({ ...base, list_price: listaDespues })

    let cuotas: CuotaCambio[] = []
    let pagado = 0
    if (caso.kind === 'IW') {
      const plan = planCuotas(cuenta, tuitionDespues?.total ?? 0, caso.fecha)
      cuotas = plan.cuotas; pagado = plan.pagado
    } else {
      pagado = r2(cuenta.charges.filter(c => c.charge_type === CHARGE_TUITION).reduce((s, c) => s + Number(c.paid), 0))
      const diferencia = r2((tuitionDespues?.total ?? 0) - (tuitionAntes?.total ?? 0))
      if (diferencia > 0.005) cuotas = [{ external_id: null, accion: 'crear', amount: diferencia, due_date: caso.fecha }]
    }

    // Un bloque entra si hay algo que hacer O si el plan de cuotas no cuadra
    // con el tuition (caso IW ya liquidado en julio pero con cuotas sin ajustar)
    if (cambios.length || cuotas.length) {
      bloques.push({
        enrollment_id: enrollmentId, program_name: cuenta.program_name,
        cursos: cambios, creditos_antes: antes, creditos_despues: despues,
        tuition_antes: tuitionAntes, tuition_despues: tuitionDespues,
        tuition_pagado: pagado, cuotas,
      })
    }
  }

  return { caso, bloques, sin_cambios: bloques.length === 0 }
}

// ── Aplicar (solo tras autorización en la pantalla) ─────────────────────────
export async function aplicarCaso(sb: SB, caso: Caso, preview: Preview, userEmail: string): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString()
  // Respaldo previo COMPLETO de lo que se va a tocar: va dentro del snapshot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const respaldo: { enrollments: any[]; charges: any[] } = { enrollments: [], charges: [] }
  const enrRowIds = preview.bloques.flatMap(b => b.cursos.map(c => c.enrollment_row_id))
  for (let i = 0; i < enrRowIds.length; i += 150) {
    const { data } = await sb.from('academic_course_enrollments').select('*').in('id', enrRowIds.slice(i, i + 150))
    respaldo.enrollments.push(...(data ?? []))
  }
  const chIds = preview.bloques.flatMap(b => b.cuotas.map(c => c.external_id).filter(Boolean)) as string[]
  for (let i = 0; i < chIds.length; i += 150) {
    const { data } = await sb.from('account_charges').select('*').in('external_id', chIds.slice(i, i + 150))
    respaldo.charges.push(...(data ?? []))
  }
  if (respaldo.enrollments.length !== enrRowIds.length || respaldo.charges.length !== chIds.length) {
    return { ok: false, error: `El respaldo no cuadra (${respaldo.enrollments.length}/${enrRowIds.length} matrículas, ${respaldo.charges.length}/${chIds.length} cuotas): no se aplica nada.` }
  }

  for (const b of preview.bloques) {
    for (const c of b.cursos) {
      if (c.accion === 'retirar') {
        const { error } = await sb.from('academic_course_enrollments')
          .update({ status: 'retirada', closed_at: now, closed_by: `gestor-iw:${userEmail}` })
          .eq('id', c.enrollment_row_id)
        if (error) return { ok: false, error: `retirar ${c.code}: ${error.message}` }
      } else if (c.accion === 'reactivar') {
        const { error } = await sb.from('academic_course_enrollments')
          .update({ status: 'en_curso', closed_at: null, closed_by: null, opened_at: now, opened_by: `reentry:${userEmail}` })
          .eq('id', c.enrollment_row_id)
        if (error) return { ok: false, error: `reactivar ${c.code}: ${error.message}` }
      } else {
        const previa = respaldo.enrollments.find(e => String(e.id) === c.enrollment_row_id)
        const { error } = await sb.from('academic_course_enrollments').insert({
          id: randomUUID(), student_id: caso.student_id,
          document_number: previa?.document_number ?? caso.document_number,
          course_id: c.course_id, program_id: previa?.program_id ?? null,
          program_enrollment_id: b.enrollment_id,
          attempt: Number(previa?.attempt ?? 1) + 1,
          status: 'en_curso', source: 'reentry',
          opened_at: now, opened_by: `reentry:${userEmail}`,
        })
        if (error) return { ok: false, error: `nuevo intento ${c.code}: ${error.message}` }
      }
    }
    for (const q of b.cuotas) {
      if (q.accion === 'eliminar' && q.external_id) {
        const { error } = await sb.from('account_charges').delete().eq('external_id', q.external_id)
        if (error) return { ok: false, error: `eliminar cuota: ${error.message}` }
      } else if (q.accion === 'reducir' && q.external_id) {
        const { error } = await sb.from('account_charges').update({ amount: q.nuevo_amount }).eq('external_id', q.external_id)
        if (error) return { ok: false, error: `reducir cuota: ${error.message}` }
      } else if (q.accion === 'crear') {
        const { error } = await sb.from('account_charges').insert({
          external_id: randomUUID(), student_id: caso.student_id,
          enrollment_id: b.enrollment_id, amount: q.amount, due_date: q.due_date,
          charge_type: CHARGE_TUITION, source: 'erp',
          reference: caso.kind === 'IW' ? 'Liquidación IW' : 'Re-Entry',
        })
        if (error) return { ok: false, error: `crear cuota: ${error.message}` }
      }
    }
  }

  const { error: eG } = await sb.from('iw_reentry_gestiones').insert({
    student_id: caso.student_id, kind: caso.kind, trigger_id: caso.trigger_id,
    status: 'aplicado', snapshot: { preview, respaldo }, applied_by: userEmail, applied_at: now,
  })
  if (eG) return { ok: false, error: `la gestión se aplicó pero no se pudo sellar: ${eG.message}` }
  return { ok: true }
}

export async function descartarCaso(sb: SB, caso: Caso, nota: string, userEmail: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from('iw_reentry_gestiones').insert({
    student_id: caso.student_id, kind: caso.kind, trigger_id: caso.trigger_id,
    status: 'descartado', nota, applied_by: userEmail,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}
