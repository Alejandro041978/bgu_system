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

// Campos del portal ZBL que bloqueamos. `amount` para que no se pueda pagar
// otra cifra; los identificadores para que la conciliación no dependa de que el
// estudiante no los toque. `student_email` y los nombres quedan editables a
// propósito: si nuestro dato está desactualizado, bloquearlo dejaría al
// estudiante trabado sin poder pagar (los tres son obligatorios en el portal).
const READ_ONLY = 'amount,student_id,dni,id_cuota'

// Botón "Pagar" de una cuota: abre el checkout hospedado de Flywire con el
// monto fijo y la referencia de la cuota.
//
// El portal ZBL define 9 campos dinámicos propios (sección "Student
// Information"). Cuatro son obligatorios — student_id, student_first_name,
// student_last_name, student_email — así que si no los enviamos el estudiante
// los tipea a mano teniendo nosotros el dato. Y `dni` tiene
// internal_alias = external_reference: es el campo por el que Flywire reporta
// la referencia externa del pago, y el mismo que empareja el import del CSV.
export function FlywirePayButton(
  { chargeExternalId, amount, studentName, studentDocument, studentEmail }:
  {
    chargeExternalId: string; amount: number
    studentName?: string | null; studentDocument?: string | null; studentEmail?: string | null
  }
) {
  if (!RECIPIENT) return null

  function pay() {
    const [firstName, ...rest] = (studentName ?? '').trim().split(/\s+/)
    const params = new URLSearchParams({
      recipient: RECIPIENT!,
      amount: String(Math.round(amount * 100)), // centavos (el portal es USD, subunidad 100)
      // Referencia de la cuota. `id_cuota` es un campo oculto del portal y
      // viaja de vuelta en la notificación (el portal publica los campos del
      // recipiente en los callbacks): es la llave real de conciliación.
      callback_id: chargeExternalId,
      id_cuota: chargeExternalId,
      // Distingue los pagos nacidos de este botón de los que el estudiante
      // hace entrando al portal de Flywire por su cuenta.
      payment_source: 'ERP',
      read_only: READ_ONLY,
    })
    if (firstName) params.set('student_first_name', firstName)
    if (rest.length) params.set('student_last_name', rest.join(' '))
    // El ERP no tiene un código de estudiante aparte: el documento ES el
    // código (así lo empareja también el import del CSV, por `dni`).
    if (studentDocument) {
      params.set('student_id', studentDocument)
      params.set('dni', studentDocument)
    }
    if (studentEmail) params.set('student_email', studentEmail)
    // Al terminar, Flywire ofrece volver al estado de cuenta (en Intelligent
    // Links el retorno es `return_cta`, no `return_url` — ese es del embed).
    if (typeof window !== 'undefined') {
      params.set('return_cta', `${window.location.origin}/student/account`)
      params.set('return_cta_name', 'Volver a mi estado de cuenta')
    }

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
