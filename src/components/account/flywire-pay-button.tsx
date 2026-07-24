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

    // Ventana popup LIMPIA y centrada: al pasar dimensiones, el navegador la
    // abre como popup (sin pestañas, marcadores ni extensiones). La barra de la
    // URL no se puede ocultar (los navegadores la fuerzan por seguridad) — y
    // aquí ayuda: el estudiante ve payment.flywire.com y confía en la pasarela.
    const w = 460, h = 780
    const left = Math.max(0, (window.screen.availWidth - w) / 2)
    const top = Math.max(0, (window.screen.availHeight - h) / 2)
    const feats = `popup=yes,width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes,noopener,noreferrer`
    window.open(`${BASE}?${params.toString()}`, 'flywire_pay', feats)
  }

  return (
    <button type="button" onClick={pay}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
      <CreditCard className="w-3.5 h-3.5" /> Pagar
    </button>
  )
}
