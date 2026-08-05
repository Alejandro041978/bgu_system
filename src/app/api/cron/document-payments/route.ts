import { NextRequest, NextResponse } from 'next/server'
import { sweepDocumentPayments } from '@/lib/document-request'

export const maxDuration = 300

// Red de seguridad de las solicitudes de documento.
//
// Avanzar una solicitud cuando su cuota queda saldada es un gatillo que hay que
// tirar desde donde se registra el pago. Quince rutas escriben en
// account_payments y solo tres se acordaban de tirar de él —Flywire, que es por
// donde entra casi todo el dinero, no estaba entre ellas—, así que había
// estudiantes que pagaban y se quedaban en "esperando pago" indefinidamente,
// con su cuota marcada Pagada en el estado de cuenta.
//
// Las rutas de Flywire ya llaman al gatillo. Esto es lo que hace que no vuelva
// a importar: una ruta nueva que lo olvide provocará como mucho un retraso de
// horas, no un estudiante atascado para siempre.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await sweepDocumentPayments())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
