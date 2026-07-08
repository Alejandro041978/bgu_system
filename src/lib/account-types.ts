// Etiquetas de los Type crudos de SystemActiva. Ampliar conforme se confirmen.

// Installment.Type (cuotas)
export const CHARGE_TYPE_LABELS: Record<number, string> = {
  1: 'Admission and Technology Fee',
  5: 'Tuition',
}

export function chargeTypeLabel(t: number | null): string {
  if (t == null) return '—'
  return CHARGE_TYPE_LABELS[t] ?? `Tipo ${t}`
}

// Payment.Type (métodos/estado de pago)
export const PAYMENT_TYPE_LABELS: Record<number, string> = {}

export function paymentTypeLabel(t: number | null): string {
  if (t == null) return '—'
  return PAYMENT_TYPE_LABELS[t] ?? `Tipo ${t}`
}
