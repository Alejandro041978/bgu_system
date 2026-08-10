import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { FLYWIRE_PAID_STATUSES, desdeSubunidades } from '@/lib/flywire'
import { emparejarPorDocumento, documentoDe } from '@/lib/flywire-match'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Notificaciones de Flywire que no acabaron en el estado de cuenta de nadie.
//
// Hasta hoy esto no existía: si una notificación no se conciliaba, el webhook
// respondía 200 y el asunto moría ahí. Se descubrió por casualidad, después de
// 222 avisos y 29 pagos perdidos.
//
// Ahora hay una lista, y cada fila dice POR QUÉ no se pudo colocar — que es lo
// que decide quién tiene que hacer algo: Admisión si el pagador todavía no
// existe, Cobranzas si existe y no debe nada, Sistemas si la firma falla.
// ---------------------------------------------------------------------------
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()

  const { data: ev } = await sb.from('flywire_events')
    .select('received_at, raw, signature_valid, signature_key')
    .not('signature_valid', 'is', null).order('received_at')

  // Un pago, varias notificaciones: se queda la que trae el estado de cobrado.
  const pagos = new Map<string, { fecha: string; d: Record<string, unknown>; firma: boolean }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (ev ?? []) as any[]) {
    const d = e.raw?.data
    if (!d?.payment_id) continue
    if (!FLYWIRE_PAID_STATUSES.has(String(d.status ?? '').toLowerCase())) continue
    pagos.set(String(d.payment_id), { fecha: String(e.received_at).slice(0, 10), d, firma: !!e.signature_valid })
  }

  const filas = []
  for (const [pid, p] of pagos) {
    const { data: ya } = await sb.from('account_payments').select('id').eq('flywire_payment_id', pid).maybeSingle()
    if (ya) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = p.d as any
    const importe = desdeSubunidades(d.amount_to != null ? Number(d.amount_to) : null, d.currency_to)
    let motivo: string
    let accion: string
    if (!p.firma) {
      motivo = 'la firma no validó'
      accion = 'Sistemas'
    } else {
      const m = await emparejarPorDocumento(sb, d.fields, d.fields?.student_email)
      motivo = m.motivo
      accion = m.ok ? 'se puede conciliar' : (m.student_id ? 'Cobranzas' : 'Admisión')
    }

    filas.push({
      payment_id: pid, fecha: p.fecha, importe, moneda: d.currency_to ?? null,
      pagador: [d.fields?.student_first_name, d.fields?.student_last_name].filter(Boolean).join(' ') || '—',
      documento: documentoDe(d.fields), email: d.fields?.student_email ?? null,
      id_cuota: d.fields?.id_cuota || null,
      firma: p.firma, motivo, accion,
    })
  }

  filas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
  return NextResponse.json({
    total: filas.length,
    importe: Math.round(filas.reduce((s, f) => s + Number(f.importe ?? 0), 0) * 100) / 100,
    por_accion: filas.reduce((acc: Record<string, number>, f) => ({ ...acc, [f.accion]: (acc[f.accion] ?? 0) + 1 }), {}),
    filas,
  })
}
