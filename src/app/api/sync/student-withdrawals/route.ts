import { NextResponse } from 'next/server'

// ============================================================================
// RETIRADO — no usar.
//   Este endpoint importaba los retiros (IW) de SystemActiva vía N8N. Se corrió
//   una única vez (297 retiros → 285 estudiantes) y ya cumplió su función.
//
//   Desde entonces la fuente de verdad de los retiros es NUESTRO ERP
//   (tabla student_withdrawals). Volver a correrlo sería destructivo: su lógica
//   de reversión devolvía a 'activo' cualquier retiro que no viniera en el
//   payload de SystemActiva, borrando los IW/LOA registrados en el ERP.
//
//   Por eso responde 410 Gone en vez de existir con la lógica viva.
// ============================================================================
export async function POST() {
  return NextResponse.json({
    error: 'Endpoint retirado. Los retiros ahora se gestionan desde el ERP (Registros → Retiros); ya no se importan de SystemActiva.',
  }, { status: 410 })
}
