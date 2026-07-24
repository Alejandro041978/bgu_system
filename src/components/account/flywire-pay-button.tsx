'use client'

import { CreditCard } from 'lucide-react'

const ENV = process.env.NEXT_PUBLIC_FLYWIRE_ENV || 'demo'
const RECIPIENT = process.env.NEXT_PUBLIC_FLYWIRE_RECIPIENT

// Base del checkout HOSPEDADO de Flywire (pestaña principal, NO iframe).
// El embed 2.0 (checkout.js dentro de iframe) fallaba: el hCaptcha del portal
// ZBL no puede validarse en un iframe cross-origin → la orden se rechazaba con
// 422 y el estudiante veía "Se ha producido un error". El hosted checkout corre
// en top-level, donde el captcha SÍ funciona (es el "link directo" que procesa).
const BASE = ENV === 'production'
  ? 'https://payment.flywire.com/pay/payment'
  : 'https://payment.demo.flywire.com/pay/payment'

// Botón "Pagar" de una cuota: abre el checkout hospedado de Flywire con el
// monto fijo y la referencia de la cuota. El portal ZBL tiene campos propios
// (id_cuota, id_registro_cuotas) + callback_id: por ahí viaja el external_id
// de la cuota para conciliar el pago con su cuota al importar el reporte.
export function FlywirePayButton(
  { chargeExternalId, amount, studentName }:
  { chargeExternalId: string; amount: number; studentName?: string | null }
) {
  if (!RECIPIENT) return null

  function pay() {
    const [firstName, ...rest] = (studentName ?? '').trim().split(/\s+/)
    const params = new URLSearchParams({
      recipient: RECIPIENT!,
      amount: String(Math.round(amount * 100)), // centavos
      // Referencia de la cuota en los campos que el portal ZBL ya expone y que
      // aparecen en el reporte de Flywire (para conciliar al importar el CSV).
      callback_id: chargeExternalId,
      id_cuota: chargeExternalId,
      // El monto no se puede editar en el checkout.
      read_only: 'amount,id_cuota',
    })
    if (firstName) params.set('student_first_name', firstName)
    if (rest.length) params.set('student_last_name', rest.join(' '))
    window.open(`${BASE}?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <button type="button" onClick={pay}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
      <CreditCard className="w-3.5 h-3.5" /> Pagar
    </button>
  )
}
