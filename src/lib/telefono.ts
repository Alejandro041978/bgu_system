// El número de teléfono de un estudiante, listo para marcar.
//
// phone_number ya es el canónico E.164: la ficha lo recompone al guardar como
// código + número local, así que un peruano tiene phone_code '+51' y
// phone_number '+51948009908'. Concatenar los dos produce '+51+51948009908',
// que Twilio rechaza con el error 21211 — y así se perdieron los 74 mensajes
// que Camila intentó enviar entre el 29 de julio y el 5 de agosto: todos, sin
// una sola excepción, y sin que ninguna pantalla lo dijera.
//
// De 1.612 estudiantes con teléfono, 1.584 ya traen el código dentro del
// número y NINGUNO necesita que se le añada. La concatenación no fallaba a
// veces: no acertaba nunca.
//
// Vive aquí porque lo arman dos sitios —el envío de campañas y el análisis del
// supervisor— y escribirlo dos veces fue exactamente cómo empezó esto.
export function telefonoE164(
  s: { phone_code?: string | null; phone_number?: string | null; phone_local?: string | null } | null | undefined
): string | null {
  if (!s) return null
  const num = String(s.phone_number ?? '').trim()
  const code = String(s.phone_code ?? '').trim()

  // El canónico manda. Si ya viene en E.164, se usa tal cual.
  if (num.startsWith('+')) {
    const limpio = '+' + num.slice(1).replace(/\D/g, '')
    return limpio.length >= 9 ? limpio : null
  }
  // Sin canónico: se compone, pero solo si el local no repite ya el código.
  const local = String(s.phone_local ?? num).replace(/\D/g, '')
  if (!local) return null
  const codeDigits = code.replace(/\D/g, '')
  if (!codeDigits) return local.length >= 9 ? '+' + local : null
  const compuesto = local.startsWith(codeDigits) ? local : codeDigits + local
  return compuesto.length >= 9 ? '+' + compuesto : null
}
