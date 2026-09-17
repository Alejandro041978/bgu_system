import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Colocación automática global — RETIRADA (17/09/2026).
//
// Nació el 21/07/2026 para el atraso histórico: colocaba en bloque a toda
// matrícula sin carrusel de programas con una sola entrada. Regla vigente del
// usuario: la vendedora CARGA (colección + carrusel quedan en la matrícula), el
// PAGO ejecuta (la activación coloca) y las páginas de Carruseles y Estudiantes
// por Convocatoria solo REFLEJAN. Una colocación masiva desde una página de
// consulta contradice esa regla, así que el endpoint responde 410.
// ---------------------------------------------------------------------------
export async function POST() {
  return NextResponse.json({
    error: 'La colocación automática fue retirada: la colocación la ejecuta la activación de cada matrícula con el carrusel cargado en ella.',
  }, { status: 410 })
}
