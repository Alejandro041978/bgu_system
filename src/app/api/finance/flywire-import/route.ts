import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0
export const maxDuration = 60

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
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as { rows?: Row[]; commit?: boolean; include_duplicates?: boolean } | null
  const rows = body?.rows ?? []
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })
  const commit = !!body?.commit
  const includeDups = !!body?.include_duplicates

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

  // Pagos existentes de los estudiantes implicados (detección de duplicados vs Activa)
  interface Existing { amount: number; paid_date: string | null; flywire_payment_id: string | null }
  const payByStudent = new Map<string, Existing[]>()
  {
    const ids = [...new Set(importables.map(r => {
      const sid = byDoc.get(normDoc(r.dni)) ?? null
      if (sid) return sid
      const c = byName.get(`${normName(r.first_name)}|${normName(r.last_name)}`)
      return c?.length === 1 ? c[0] : null
    }).filter(Boolean))] as string[]
    for (let i = 0; i < ids.length; i += 150) {
      const part = ids.slice(i, i + 150)
      const { data } = await sb.from('account_payments')
        .select('student_id, amount, paid_date, flywire_payment_id').in('student_id', part)
      for (const p of (data ?? [])) {
        if (!payByStudent.has(p.student_id)) payByStudent.set(p.student_id, [])
        payByStudent.get(p.student_id)!.push(p)
      }
    }
  }

  const dayDiff = (a: string | null, b: string | null) => {
    if (!a || !b) return 999
    return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
  }

  type Verdict = 'importar' | 'actualizar' | 'enriquecer' | 'revertido' | 'posible_duplicado' | 'sin_estudiante' | 'nombre_ambiguo'
  const out: { row: Row; verdict: Verdict; student_id?: string; student?: string; detail?: string }[] = []

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

    // ¿Ya está registrado vía Activa? (mismo monto ±0.01 y fecha ±5 días, sin marca Flywire)
    const paidDate = r.finished_date ? r.finished_date.slice(0, 10) : new Date().toISOString().slice(0, 10)
    const dup = (payByStudent.get(sid) ?? []).find(p =>
      !p.flywire_payment_id && Math.abs(Number(p.amount) - r.amount) < 0.01 && dayDiff(p.paid_date, paidDate) <= 5)
    if (dup && !includeDups) {
      out.push({ row: r, verdict: 'posible_duplicado', student_id: sid, student: studentName, detail: `ya hay un pago de ${dup.amount} el ${dup.paid_date}` })
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
  let inserted = 0, linked = 0, updated = 0, enriched = 0
  const errors: string[] = []

  // Pasada de enriquecimiento: pagos históricos de Activa ganan la analítica
  // Flywire (método/moneda/país + flywire_payment_id) SIN tocar monto ni fecha.
  for (const o of out) {
    if (o.verdict !== 'enriquecer') continue
    const target = zblMap.get(o.row.reference)!
    let { error } = await sb.from('account_payments').update({
      flywire_payment_id: o.row.reference,
      payment_method: o.row.method || null,
      currency_from: o.row.currency || null,
      country_from: o.row.country || null,
    }).eq('id', target.id)
    if (error && /column/i.test(error.message)) {
      ({ error } = await sb.from('account_payments').update({ flywire_payment_id: o.row.reference }).eq('id', target.id))
    }
    if (error) { errors.push(`${o.row.reference}: ${error.message}`); continue }
    enriched++
    if (target.charge_external_id) {
      await sb.from('account_charges')
        .update({ flywire_status: o.row.status, flywire_payment_id: o.row.reference })
        .eq('external_id', target.charge_external_id)
    }
  }

  // Pasada de actualización: referencias ya importadas que cambiaron de etapa/fecha
  for (const o of out) {
    if (o.verdict !== 'actualizar') continue
    const prev = existingFly.get(o.row.reference)!
    const newDate = o.row.finished_date ? o.row.finished_date.slice(0, 10) : null
    if (newDate && prev.paid_date !== newDate) {
      const { error } = await sb.from('account_payments').update({ paid_date: newDate }).eq('id', prev.id)
      if (error) { errors.push(`${o.row.reference}: ${error.message}`); continue }
    }
    if (prev.charge_external_id) {
      await sb.from('account_charges').update({ flywire_status: o.row.status }).eq('external_id', prev.charge_external_id)
    }
    updated++
  }

  for (const o of out) {
    if (o.verdict !== 'importar') continue
    const r = o.row
    const paidDate = r.finished_date ? r.finished_date.slice(0, 10) : new Date().toISOString().slice(0, 10)

    // Cuota impaga del mismo monto (la más antigua) para enlazar el pago
    let chargeExt: string | null = null
    const { data: charges } = await sb.from('account_charges')
      .select('external_id, amount, due_date').eq('student_id', o.student_id).order('due_date', { ascending: true })
    const { data: paysOf } = await sb.from('account_payments')
      .select('charge_external_id').eq('student_id', o.student_id).not('charge_external_id', 'is', null)
    const paidCharges = new Set((paysOf ?? []).map((p: { charge_external_id: string }) => p.charge_external_id))
    const open = (charges ?? []).find((c: { external_id: string; amount: number }) =>
      !paidCharges.has(c.external_id) && Math.abs(Number(c.amount) - r.amount) < 0.01)
    if (open) chargeExt = open.external_id

    const base = {
      external_id: crypto.randomUUID(),
      flywire_payment_id: r.reference,
      charge_external_id: chargeExt,
      student_id: o.student_id,
      amount: r.amount,
      paid_date: paidDate,
      series_code: 'FLYWIRE',
      transaction_reference: r.reference,
    }
    // Analítica (método/moneda/país): si la migración aún no corrió, reintenta sin ellas
    let { error } = await sb.from('account_payments').insert({
      ...base,
      payment_method: r.method || null,
      currency_from: r.currency || null,
      country_from: r.country || null,
    })
    if (error && /column/i.test(error.message)) {
      ({ error } = await sb.from('account_payments').insert(base))
    }
    if (error) { errors.push(`${r.reference}: ${error.message}`); continue }
    inserted++
    if (chargeExt) {
      linked++
      await sb.from('account_charges')
        .update({ flywire_status: r.status, flywire_payment_id: r.reference })
        .eq('external_id', chargeExt)
    }
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

  return NextResponse.json({ ok: true, counts, inserted, updated, enriched, linked_to_charge: linked, events_logged: eventsLogged, errors })
}
