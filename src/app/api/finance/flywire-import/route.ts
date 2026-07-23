import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { fetchByIn } from '@/lib/grades-write'
import { initialsPaid, activateEnrollment } from '@/lib/enrollment-activation'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const normDoc = (s: string | null | undefined) => (s ?? '').replace(/[^0-9a-zA-Z]/g, '')
const normName = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

interface Row {
  reference: string
  first_name: string
  last_name: string
  dni: string
  amount: number
  currency: string
  country: string
  method: string
  status: string
  finished_date: string | null
}

// POST { rows, commit?, include_duplicates? } — importa el reporte CSV de Flywire.
// delivered/guaranteed → pago; initiated/cancelled → solo informativo.
// Idempotente por Transfer Reference (flywire_payment_id).
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado', v: 4 }, { status: 401 })

  const body = await req.json().catch(() => null) as { rows?: Row[]; commit?: boolean; include_duplicates?: boolean; exclude?: string[] } | null
  const rows = body?.rows ?? []
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })
  const commit = !!body?.commit
  const includeDups = !!body?.include_duplicates
  const excluded = new Set(body?.exclude ?? [])

  const sb = db()

  // Estudiantes: por documento normalizado y por nombre normalizado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const students: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number').range(from, from + 999)
    students.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const byDoc = new Map<string, string>()
  const byName = new Map<string, string[]>()
  for (const s of students) {
    if (s.document_number) byDoc.set(normDoc(String(s.document_number)), s.id)
    const keys = new Set([
      `${normName(s.first_name)}|${normName(s.last_name)}`,
      `${normName(s.first_name)}|${normName([s.last_name, s.second_last_name].filter(Boolean).join(' '))}`,
    ])
    for (const k of keys) {
      if (!byName.has(k)) byName.set(k, [])
      if (!byName.get(k)!.includes(s.id)) byName.get(k)!.push(s.id)
    }
  }

  // Pagos Flywire ya importados (idempotencia + pasada de actualización)
  const existingFly = new Map<string, { id: string; paid_date: string | null; charge_external_id: string | null }>()
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('account_payments')
      .select('id, flywire_payment_id, paid_date, charge_external_id')
      .not('flywire_payment_id', 'is', null).range(from, from + 999)
    for (const p of (data ?? [])) existingFly.set(p.flywire_payment_id, p)
    if ((data ?? []).length < 1000) break
  }

  // Pagos históricos de Activa con referencia ZBL (para ENRIQUECER, no duplicar):
  // el equipo a veces anotó sufijos ("ZBL123/12OCTUBRE2023") → se extrae el patrón
  const zblMap = new Map<string, { id: string; charge_external_id: string | null }>()
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('account_payments')
      .select('id, transaction_reference, flywire_payment_id, charge_external_id')
      .not('transaction_reference', 'is', null).range(from, from + 999)
    for (const p of (data ?? [])) {
      if (p.flywire_payment_id) continue // ya asociado
      const m = String(p.transaction_reference).match(/ZBL\d+/)
      if (m) zblMap.set(m[0], { id: p.id, charge_external_id: p.charge_external_id })
    }
    if ((data ?? []).length < 1000) break
  }

  const importables = rows.filter(r => ['delivered', 'guaranteed'].includes(r.status))
  // Reversión: un pago que ya importamos y que Flywire ahora reporta cancelado
  const revertidos = rows.filter(r => r.status === 'cancelled' && existingFly.has(r.reference))
  const informativos = rows.length - importables.length - revertidos.length

  // Pagos existentes de los estudiantes implicados (detección de duplicados vs
  // Activa). fetchByIn pagina DENTRO de cada tanda: sin el tope de 1000 filas.
  interface Existing { id: string; amount: number; paid_date: string | null; flywire_payment_id: string | null; transaction_reference: string | null }
  const csvRefs = new Set(rows.map(r => r.reference))
  const payByStudent = new Map<string, Existing[]>()
  {
    const ids = [...new Set(importables.map(r => {
      const sid = byDoc.get(normDoc(r.dni)) ?? null
      if (sid) return sid
      const c = byName.get(`${normName(r.first_name)}|${normName(r.last_name)}`)
      return c?.length === 1 ? c[0] : null
    }).filter(Boolean))] as string[]
    const pays = ids.length
      ? await fetchByIn(sb, 'account_payments', 'id, student_id, amount, paid_date, flywire_payment_id, transaction_reference', 'student_id', ids)
      : []
    for (const p of pays as (Existing & { student_id: string })[]) {
      if (!payByStudent.has(p.student_id)) payByStudent.set(p.student_id, [])
      payByStudent.get(p.student_id)!.push(p)
    }
  }

  const dayDiff = (a: string | null, b: string | null) => {
    if (!a || !b) return 999
    return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
  }

  type Verdict = 'importar' | 'actualizar' | 'enriquecer' | 'revertido' | 'posible_duplicado' | 'sin_estudiante' | 'nombre_ambiguo'
  const out: { row: Row; verdict: Verdict; student_id?: string; student?: string; detail?: string; dup_payment_id?: string }[] = []

  for (const r of revertidos) {
    out.push({ row: r, verdict: 'revertido', detail: 'ya registrado como pago y Flywire lo reporta cancelado: resolver a mano (el importador no borra pagos)' })
  }
  for (const r of importables) {
    const prev = existingFly.get(r.reference)
    if (prev) {
      // Ya importado: ¿cambió de etapa o de fecha? (guaranteed → delivered)
      const newDate = r.finished_date ? r.finished_date.slice(0, 10) : null
      const needsDate = newDate && prev.paid_date !== newDate
      out.push({ row: r, verdict: 'actualizar', detail: needsDate ? `fecha ${prev.paid_date} → ${newDate}` : 'refresca estado en la cuota' })
      continue
    }
    // Pago histórico de Activa con este ZBL: enriquecer, no duplicar
    if (zblMap.has(r.reference)) {
      out.push({ row: r, verdict: 'enriquecer' })
      continue
    }

    // Resolver estudiante: documento primero, nombre después
    let sid: string | null = byDoc.get(normDoc(r.dni)) ?? null
    if (!sid) {
      const cands = byName.get(`${normName(r.first_name)}|${normName(r.last_name)}`) ?? []
      if (cands.length === 1) sid = cands[0]
      else if (cands.length > 1) { out.push({ row: r, verdict: 'nombre_ambiguo', detail: `${cands.length} estudiantes con ese nombre` }); continue }
    }
    if (!sid) { out.push({ row: r, verdict: 'sin_estudiante' }); continue }

    const stu = students.find(s => s.id === sid)
    const studentName = [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' ')

    // ¿Ya está registrado vía Activa? (mismo monto ±0.01 y fecha ±10 días, sin
    // marca Flywire; las transferencias se entregan días después del registro).
    // NO se puede reclamar un pago cuyo ZBL escrito pertenece a otra fila del
    // CSV (ese lo resuelve el enriquecimiento). El más cercano en fecha gana.
    const paidDate = r.finished_date ? r.finished_date.slice(0, 10) : new Date().toISOString().slice(0, 10)
    const dups = (payByStudent.get(sid) ?? [])
      .filter(p => {
        if (p.flywire_payment_id) return false
        const written = String(p.transaction_reference ?? '').match(/ZBL\d+/)?.[0]
        if (written && written !== r.reference && csvRefs.has(written)) return false
        return Math.abs(Number(p.amount) - r.amount) < 0.01 && dayDiff(p.paid_date, paidDate) <= 10
      })
      .sort((a, b) => dayDiff(a.paid_date, paidDate) - dayDiff(b.paid_date, paidDate))
    if (dups.length && !includeDups) {
      out.push({
        row: r, verdict: 'posible_duplicado', student_id: sid, student: studentName,
        dup_payment_id: dups[0].id,
        detail: `se asociará al pago de ${dups[0].amount} del ${dups[0].paid_date} en Activa`,
      })
      continue
    }
    out.push({ row: r, verdict: 'importar', student_id: sid, student: studentName })
  }

  const counts = {
    total_csv: rows.length,
    informativos,
    importar: out.filter(o => o.verdict === 'importar').length,
    actualizar: out.filter(o => o.verdict === 'actualizar').length,
    enriquecer: out.filter(o => o.verdict === 'enriquecer').length,
    revertido: out.filter(o => o.verdict === 'revertido').length,
    posible_duplicado: out.filter(o => o.verdict === 'posible_duplicado').length,
    sin_estudiante: out.filter(o => o.verdict === 'sin_estudiante').length,
    nombre_ambiguo: out.filter(o => o.verdict === 'nombre_ambiguo').length,
  }

  if (!commit) {
    return NextResponse.json({
      preview: true, counts,
      detalle: out.filter(o => o.verdict !== 'actualizar' && o.verdict !== 'enriquecer').map(o => ({
        referencia: o.row.reference, nombre_csv: `${o.row.first_name} ${o.row.last_name}`,
        dni: o.row.dni || null, monto: o.row.amount, estado: o.row.status,
        fecha: o.row.finished_date?.slice(0, 10) ?? null,
        veredicto: o.verdict, estudiante: o.student ?? null, nota: o.detail ?? null,
      })),
    })
  }

  // COMMIT: insertar pagos + enlazar cuota impaga del mismo monto + estado en la cuota
  let inserted = 0, linked = 0, updated = 0, enriched = 0, associated = 0
  const errors: string[] = []

  // Posibles duplicados → ASOCIAR al pago de Activa (ZBL + analítica, sin crear
  // dinero nuevo). Un pago de Activa solo puede reclamar UNA fila del CSV.
  {
    const claimed = new Set<string>()
    for (const o of out) {
      if (o.verdict !== 'posible_duplicado' || !o.dup_payment_id) continue
      if (claimed.has(o.dup_payment_id)) { errors.push(`${o.row.reference}: el pago de Activa ya fue asociado a otra referencia; revisar a mano`); continue }
      claimed.add(o.dup_payment_id)
      let { error } = await sb.from('account_payments').update({
        flywire_payment_id: o.row.reference,
        payment_method: o.row.method || null,
        currency_from: o.row.currency || null,
        country_from: o.row.country || null,
      }).eq('id', o.dup_payment_id)
      if (error && /column/i.test(error.message)) {
        ({ error } = await sb.from('account_payments').update({ flywire_payment_id: o.row.reference }).eq('id', o.dup_payment_id))
      }
      if (error) { errors.push(`${o.row.reference}: ${error.message}`); continue }
      associated++
    }
  }

  // Pasada de enriquecimiento: pagos históricos de Activa ganan la analítica
  // Flywire (método/moneda/país + flywire_payment_id) SIN tocar monto ni fecha.
  // Updates individuales en tandas paralelas (el upsert parcial exige columnas
  // NOT NULL que no viajan — lección aprendida).
  {
    const enr = out.filter(o => o.verdict === 'enriquecer')
    for (let i = 0; i < enr.length; i += 100) {
      const wave = enr.slice(i, i + 100)
      const results = await Promise.all(wave.map(o =>
        sb.from('account_payments').update({
          flywire_payment_id: o.row.reference,
          payment_method: o.row.method || null,
          currency_from: o.row.currency || null,
          country_from: o.row.country || null,
        }).eq('id', zblMap.get(o.row.reference)!.id)
      ))
      results.forEach((r2, j) => {
        if (r2.error) errors.push(`enriquecer ${wave[j].row.reference}: ${r2.error.message}`)
        else enriched++
      })
    }
    // Estado Flywire en las cuotas enlazadas (dedup: una cuota, un update)
    const chargeUpd = new Map<string, { flywire_status: string; flywire_payment_id: string }>()
    for (const o of enr) {
      const ce = zblMap.get(o.row.reference)!.charge_external_id
      if (ce) chargeUpd.set(ce, { flywire_status: o.row.status, flywire_payment_id: o.row.reference })
    }
    const chargeList = [...chargeUpd.entries()]
    for (let i = 0; i < chargeList.length; i += 100) {
      const wave = chargeList.slice(i, i + 100)
      const results = await Promise.all(wave.map(([ce, v]) =>
        sb.from('account_charges').update(v).eq('external_id', ce)
      ))
      results.forEach((r2, j) => { if (r2.error) errors.push(`cuota ${wave[j][0]}: ${r2.error.message}`) })
    }
  }

  // Pasada de actualización: referencias ya importadas — refresca etapa/fecha
  // y completa la analítica si faltaba (en tandas paralelas)
  {
    const acts = out.filter(o => o.verdict === 'actualizar')
    for (let i = 0; i < acts.length; i += 100) {
      const wave = acts.slice(i, i + 100)
      const results = await Promise.all(wave.map(o => {
        const prev = existingFly.get(o.row.reference)!
        const newDate = o.row.finished_date ? o.row.finished_date.slice(0, 10) : null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {
          payment_method: o.row.method || null,
          currency_from: o.row.currency || null,
          country_from: o.row.country || null,
        }
        if (newDate && prev.paid_date !== newDate) patch.paid_date = newDate
        return sb.from('account_payments').update(patch).eq('id', prev.id)
      }))
      results.forEach((r2, j) => {
        if (r2.error) errors.push(`actualizar ${wave[j].row.reference}: ${r2.error.message}`)
        else updated++
      })
      await Promise.all(wave.map(o => {
        const prev = existingFly.get(o.row.reference)!
        return prev.charge_external_id
          ? sb.from('account_charges').update({ flywire_status: o.row.status }).eq('external_id', prev.charge_external_id)
          : Promise.resolve({ error: null })
      }))
    }
  }

  let excludedCount = 0
  // Prefetch masivo de cuotas y pagos de TODOS los estudiantes del lote —
  // antes eran 2 consultas + 1 insert POR FILA y una importación de miles de
  // filas moría en el límite de Vercel con el spinner girando para siempre.
  const importRows = out.filter(o => {
    if (o.verdict !== 'importar') return false
    if (excluded.has(o.row.reference)) { excludedCount++; return false }
    return true
  })
  const importStudents = [...new Set(importRows.map(o => o.student_id).filter(Boolean))] as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chargesByStudent = new Map<string, any[]>()
  const paidCharges = new Set<string>()
  for (let i = 0; i < importStudents.length; i += 150) {
    const part = importStudents.slice(i, i + 150)
    const { data: cs } = await sb.from('account_charges')
      .select('external_id, student_id, amount, due_date').in('student_id', part).order('due_date', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (cs ?? []) as any[]) {
      if (!chargesByStudent.has(c.student_id)) chargesByStudent.set(c.student_id, [])
      chargesByStudent.get(c.student_id)!.push(c)
    }
    const { data: ps } = await sb.from('account_payments')
      .select('charge_external_id').in('student_id', part).not('charge_external_id', 'is', null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (ps ?? []) as any[]) if (p.charge_external_id) paidCharges.add(p.charge_external_id)
  }

  // Armar todo en memoria (el enlace consume cuotas del set para no enlazar
  // dos pagos a la misma cuota dentro del mismo lote)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert: { base: any; analytics: any; chargeExt: string | null; status: string }[] = []
  for (const o of importRows) {
    const r = o.row
    const paidDate = r.finished_date ? r.finished_date.slice(0, 10) : new Date().toISOString().slice(0, 10)
    let chargeExt: string | null = null
    const open = (chargesByStudent.get(o.student_id!) ?? []).find(c =>
      !paidCharges.has(c.external_id) && Math.abs(Number(c.amount) - r.amount) < 0.01)
    if (open) { chargeExt = open.external_id; paidCharges.add(open.external_id) }
    toInsert.push({
      base: {
        external_id: crypto.randomUUID(),
        flywire_payment_id: r.reference,
        charge_external_id: chargeExt,
        student_id: o.student_id,
        amount: r.amount,
        paid_date: paidDate,
        series_code: 'FLYWIRE',
        transaction_reference: r.reference,
      },
      analytics: { payment_method: r.method || null, currency_from: r.currency || null, country_from: r.country || null },
      chargeExt,
      status: r.status,
    })
  }

  // Insertar en tandas (con analítica; si la migración no corrió, sin ella)
  let useAnalytics = true
  const chargeUpdates: { external_id: string; status: string; reference: string }[] = []
  for (let i = 0; i < toInsert.length; i += 300) {
    const wave = toInsert.slice(i, i + 300)
    const mk = (withA: boolean) => wave.map(t => withA ? { ...t.base, ...t.analytics } : t.base)
    let { error } = await sb.from('account_payments').insert(mk(useAnalytics))
    if (error && /column/i.test(error.message) && useAnalytics) {
      useAnalytics = false
      ;({ error } = await sb.from('account_payments').insert(mk(false)))
    }
    if (error) { errors.push(`tanda de inserción: ${error.message}`); continue }
    inserted += wave.length
    for (const t of wave) {
      if (t.chargeExt) { linked++; chargeUpdates.push({ external_id: t.chargeExt, status: t.status, reference: t.base.flywire_payment_id }) }
    }
  }
  for (let i = 0; i < chargeUpdates.length; i += 100) {
    await Promise.all(chargeUpdates.slice(i, i + 100).map(u =>
      sb.from('account_charges')
        .update({ flywire_status: u.status, flywire_payment_id: u.reference })
        .eq('external_id', u.external_id)))
  }

  // Embudo completo a flywire_events: TODA fila del CSV (incluidos iniciados y
  // cancelados) queda en el log histórico, sin duplicar referencia+estado.
  let eventsLogged = 0
  {
    const refs = [...new Set(rows.map(r => r.reference))]
    const seen = new Set<string>()
    for (let i = 0; i < refs.length; i += 150) {
      const { data } = await sb.from('flywire_events')
        .select('payment_id, status').in('payment_id', refs.slice(i, i + 150))
      for (const e of (data ?? [])) seen.add(`${e.payment_id}|${e.status}`)
    }
    const newEvents = rows.filter(r => !seen.has(`${r.reference}|${r.status}`)).map(r => ({
      payment_id: r.reference,
      status: r.status,
      event_type: 'csv_import',
      amount_to: r.amount,
      currency_to: 'USD',
      currency_from: r.currency || null,
      raw: { ...r },
    }))
    for (let i = 0; i < newEvents.length; i += 500) {
      const { error } = await sb.from('flywire_events').insert(newEvents.slice(i, i + 500))
      if (error) { errors.push(`eventos: ${error.message}`); break }
      eventsLogged += Math.min(500, newEvents.length - i)
    }
  }

  // Barrido de ACTIVACIÓN: los pagos importados pueden haber cubierto los
  // conceptos iniciales de matrículas pendiente_pago (caso Casanova 2026-07-23:
  // el import registraba el pago pero nadie disparaba la activación). Es
  // autocurativo: también levanta matrículas atascadas de corridas anteriores.
  let activadas = 0
  try {
    const { data: pend } = await sb.from('academic_student_enrollments').select('id').eq('status', 'pendiente_pago')
    for (const e of (pend ?? []) as { id: string }[]) {
      try {
        const { paid } = await initialsPaid(sb, e.id)
        if (!paid) continue
        const r = await activateEnrollment(e.id, 'auto:pago')
        if (r.ok) activadas++
        else if (r.errors?.length) errors.push(`activación ${e.id}: ${r.errors.join('; ')}`)
      } catch (err) { errors.push(`activación ${e.id}: ${String(err)}`) }
    }
  } catch (err) { errors.push('barrido de activación: ' + String(err)) }

  return NextResponse.json({ ok: true, counts, inserted, excluded: excludedCount, updated, enriched, associated, linked_to_charge: linked, events_logged: eventsLogged, matriculas_activadas: activadas, errors })
}
