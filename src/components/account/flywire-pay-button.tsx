'use client'

import { useEffect, useRef } from 'react'
import { CreditCard } from 'lucide-react'

const SCRIPT_SRC = 'https://payment.flywire.com/assets/js/checkout.js'
const RECIPIENT = process.env.NEXT_PUBLIC_FLYWIRE_RECIPIENT
const ENV = process.env.NEXT_PUBLIC_FLYWIRE_ENV || 'demo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { flywire?: any } }

let scriptPromise: Promise<void> | null = null
function loadCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject()
  if (window.flywire?.Checkout) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject()
    document.head.appendChild(s)
  })
  return scriptPromise
}

// Botón "Pagar con Flywire" para una cuota. Abre el Embedded Checkout con el
// monto y callback_id = external_id de la cuota (para conciliar por webhook).
export function FlywirePayButton(
  { chargeExternalId, amount, studentName }:
  { chargeExternalId: string; amount: number; studentName?: string | null }
) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const bound = useRef(false)

  useEffect(() => {
    if (!RECIPIENT || bound.current || !btnRef.current) return
    const id = `fw-${chargeExternalId}`
    btnRef.current.id = id
    const [firstName, ...rest] = (studentName ?? '').trim().split(/\s+/)
    // Config ALINEADA con el portal hospedado (el "link directo" que sí
    // funciona): NO se envía callback_url. Flywire valida la URL de
    // notificación contra la allowlist del portal ZBL; una URL no registrada
    // hace que la sesión se rechace con "Se ha producido un error" (respuesta
    // 200 pero error de negocio). Las notificaciones usan la URL configurada
    // en el portal; la conciliación operativa la hace el import de Flywire.
    // callback_id viaja para poder mapear el pago si el webhook se reactiva.
    const config = {
      env: ENV,
      recipient: RECIPIENT,
      locale: 'es',
      amount: Math.round(amount * 100), // menor unidad de la moneda (USD → centavos)
      callback_id: chargeExternalId,
      provider: 'embed2.0',
      sender_first_name: firstName || undefined,
      sender_last_name: rest.join(' ') || undefined,
      theme: { mode: 'popup', header: true, footer: true, closeButton: true, brandColor: '#2563eb' },
    }
    loadCheckout()
      .then(() => { window.flywire.Checkout.render(config, `#${id}`); bound.current = true })
      .catch(() => { /* no se pudo cargar el script */ })
  }, [chargeExternalId, amount, studentName])

  if (!RECIPIENT) return null

  return (
    <button ref={btnRef} type="button"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
      <CreditCard className="w-3.5 h-3.5" /> Pagar
    </button>
  )
}
