import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(sb: any, t: string, s: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from(t).select(s).range(f, f + 999)
    if (error) throw new Error(t + ': ' + error.message)
    o.push(...(data ?? [])); if ((data ?? []).length < 1000) break
  }
  return o
}
const zbl = (s: string | null) => String(s ?? '').match(/ZBL\d+/)?.[0] ?? null

// Auditoría de conciliación: contrasta los pagos heredados de SystemActiva
// (ZBL en transaction_reference) contra el ZBL guardado por las importaciones
// de Flywire (flywire_payment_id). Los pagos SOLO se alimentan de Flywire hoy;
// esto verifica que la data histórica de Activa cruce con lo importado.
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = db()
  const pays = await fetchAll(sb, 'account_payments',
    'id, transaction_reference, flywire_payment_id, series_code, amount, paid_date, student_id, charge_external_id')

  const ids = [...new Set(pays.map(p => p.student_id).filter(Boolean))] as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stu = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number').in('id', ids.slice(i, i + 300))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) stu.set(String(s.id), s)
  }
  const nm = (id: string) => { const s = stu.get(String(id)); return s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : '(sin estudiante)' }
  const doc = (id: string) => stu.get(String(id))?.document_number ?? ''

  const flySet = new Set(pays.map(p => p.flywire_payment_id).filter(Boolean))
  const activa = pays.filter(p => p.series_code !== 'FLYWIRE')
  // Un pago tiene RESPALDO de importación si su serie es FLYWIRE/BOOKS/DESCUENTO
  // o si una importación de Flywire lo enriqueció (flywire_payment_id). El resto
  // son LEGACY de SystemActiva: hay que migrarlos a Books o Flywire.
  const BACKED = new Set(['FLYWIRE', 'BOOKS', 'DESCUENTO'])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isLegacy = (p: any) => !BACKED.has(p.series_code) && !p.flywire_payment_id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const disc: any[] = [], orphan: any[] = [], legacy: any[] = []
  let coincide = 0
  for (const p of activa) {
    const rz = zbl(p.transaction_reference)
    if (rz && p.flywire_payment_id) {
      if (p.flywire_payment_id === rz) coincide++
      else disc.push({ nombre: nm(p.student_id), doc: doc(p.student_id), ref: rz, fly: p.flywire_payment_id, cruda: p.transaction_reference, monto: Number(p.amount), fecha: p.paid_date })
    }
    if (rz && !p.flywire_payment_id && !flySet.has(rz))
      orphan.push({ nombre: nm(p.student_id), doc: doc(p.student_id), ref: rz, cruda: p.transaction_reference, monto: Number(p.amount), fecha: p.paid_date })
    if (isLegacy(p))
      legacy.push({
        student_id: p.student_id, nombre: nm(p.student_id), doc: doc(p.student_id),
        ref: rz ?? '', cruda: p.transaction_reference ?? '', monto: Number(p.amount), fecha: p.paid_date,
        cuota: p.charge_external_id ? 'sí' : 'no', candidato: rz ? 'flywire' : 'books',
      })
  }
  disc.sort((a, b) => b.monto - a.monto)
  orphan.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  legacy.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

  const stats = {
    total: pays.length,
    activa: activa.length,
    enriquecidos: activa.filter(p => p.flywire_payment_id).length,
    flywire_nuevos: pays.length - activa.length,
    coincide, disc: disc.length, orphan: orphan.length,
    legacy: legacy.length,
    legacy_flywire: legacy.filter(l => l.candidato === 'flywire').length,
    legacy_books: legacy.filter(l => l.candidato === 'books').length,
    legacy_sum: Math.round(legacy.reduce((s, l) => s + l.monto, 0) * 100) / 100,
  }
  return NextResponse.json({ stats, disc, orphan, legacy })
}
