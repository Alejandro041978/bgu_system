import { NextResponse } from 'next/server'

// Zoho Desk fue DESCONECTADO (2026-07-22): los casos viven en la Bandeja
// Helpdesk del ERP. Esta ruta queda como lápida para que cualquier botón
// viejo explique la mudanza en vez de fallar en silencio.
export async function POST() {
  return NextResponse.json({
    error: 'Zoho Desk está desconectado: los tickets se atienden y responden en la Bandeja Helpdesk del ERP (/inbox). Esta vista es solo archivo histórico.',
  }, { status: 410 })
}
