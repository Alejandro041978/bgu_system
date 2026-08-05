import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// PATCH { id, transaction_reference } → edita la referencia de un pago (staff).
export async function PATCH(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const ref = b?.transaction_reference?.toString().trim() || null
  const { error } = await db().from('account_payments')
    .update({ transaction_reference: ref }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE { id } → borra un pago del estado de cuenta (staff). Se usa para quitar
// los pagos ficticios heredados de SystemActiva y reemplazarlos por Books/Flywire.
// Salvaguarda: si el pago provino de una asociación Books, desasocia la operación
// (vuelve a 'pendiente') para no dejar el ingreso de Books colgado.
export async function DELETE(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const b = await req.json().catch(() => null) as { id?: string } | null
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()

  // Solo se borran pagos LEGACY de SystemActiva (sin respaldo). Un pago
  // confirmado por Flywire o creado por Books NO se borra desde aquí.
  const { data: pay } = await sb.from('account_payments').select('*').eq('id', b.id).maybeSingle()
  if (!pay) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

  // Deshacer una distribución: el importe VUELVE al pago de origen, no se
  // destruye. Un abono no es dinero propio —es parte de un giro puesta en otra
  // cuota—, así que quitarlo tiene que devolverlo a donde estaba, o el giro
  // dejaría de sumar lo que Flywire mandó.
  if (pay.distributed_from_payment_id) {
    const { data: origen } = await sb.from('account_payments')
      .select('id, amount').eq('id', pay.distributed_from_payment_id).maybeSingle()
    if (origen) {
      const { error: eDev } = await sb.from('account_payments')
        .update({ amount: Math.round((Number(origen.amount) + Number(pay.amount)) * 100) / 100 }).eq('id', origen.id)
      if (eDev) return NextResponse.json({ error: eDev.message }, { status: 500 })
    }
    const { error } = await sb.from('account_payments').delete().eq('id', b.id)
    if (error) {
      // Devolver el origen a su importe: mejor dejarlo como estaba.
      if (origen) await sb.from('account_payments').update({ amount: Number(origen.amount) }).eq('id', origen.id).then(() => null, () => null)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, devuelto_a_origen: !!origen })
  }

  // Excepción: los TROZOS que dejó la migración.
  //
  // Un giro de Flywire es un pago que se asocia una vez. SystemActiva lo
  // partía en un pago por cuota, y la migración copió esos trozos poniéndoles
  // el mismo flywire_payment_id y una referencia con sufijo — "ZBL899138886
  // (1)", "(2)". El candado los tomaba por pagos confirmados de Flywire y no
  // dejaba tocarlos, así que un giro mal troceado quedaba congelado: no se
  // podía deshacer, y el giro entero tampoco reaparecía en el conciliador
  // porque sus trozos ocupaban la referencia.
  //
  // El sufijo es la firma de la migración: ni el importador ni el webhook lo
  // escriben nunca —ambos guardan la referencia a secas—, así que reconocerlo
  // no abre la puerta a borrar un pago de verdad. Borrados los trozos, el giro
  // vuelve a la bandeja completo y se asocia una sola vez.
  const esTrozoDeMigracion = /\(\d+\)\s*$/.test(String(pay.transaction_reference ?? ''))
  if (!esTrozoDeMigracion && (pay.series_code === 'FLYWIRE' || pay.series_code === 'BOOKS' || pay.flywire_payment_id)) {
    return NextResponse.json({ error: 'Este pago está respaldado por Flywire o Books: no se puede borrar (solo los heredados de SystemActiva)' }, { status: 409 })
  }
  if (esTrozoDeMigracion && (pay.series_code === 'FLYWIRE' || pay.series_code === 'BOOKS')) {
    return NextResponse.json({ error: 'Este pago está respaldado por Flywire o Books: no se puede borrar' }, { status: 409 })
  }

  // Si este pago fue una asociación de Books, libera la operación de Books
  const { data: op } = await sb.from('books_operations').select('id').eq('associated_payment_id', b.id).maybeSingle()
  if (op) {
    await sb.from('books_operations').update({
      gestion_status: 'pendiente', associated_charge_external_id: null, associated_payment_id: null,
      gestion_note: null, gestion_by: null, gestion_at: null,
    }).eq('id', op.id).then(() => null, () => null)
  }

  const { error } = await sb.from('account_payments').delete().eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, freed_books_operation: !!op })
}
