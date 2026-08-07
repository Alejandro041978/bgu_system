import { createClient } from '@supabase/supabase-js'
import { maybeMarkDocumentPaid } from './document-request'
import { maybeMarkExamPaid } from './exam-requests'
import { maybeMarkTramitePaid } from './tramites'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Todo lo que una cuota saldada desencadena, en un solo sitio.
//
// Hay tres solicitudes que esperan a que el estudiante pague —documento,
// trámite y examen— y cada una tiene su gatillo. El problema no era el diseño
// sino la aritmética: quince rutas escriben pagos y cada una tenía que
// acordarse de los TRES. Nadie se acuerda de tres cosas quince veces.
//
// El 06-08 se descubrió que Flywire —por donde entra casi todo el dinero— no
// llamaba a ninguno: siete solicitudes de documento llevaban semanas pagadas y
// paradas. Se enganchó el de documentos y se olvidaron los otros dos, así que
// al día siguiente apareció José Armando Castillo con su re-entry pagado y su
// trámite en "Iniciado · Aún sin pagar".
//
// Un gatillo que hay que recordar es un gatillo que se olvida. Aquí van juntos,
// y el barrido comprueba el RESULTADO en vez de confiar en que cada ruta llame.

export async function aplicarGatillosDePago(chargeExternalId: string): Promise<string[]> {
  const efectos: string[] = []
  try { if (await maybeMarkDocumentPaid(chargeExternalId)) efectos.push('documento') } catch (e) { console.error('gatillo documento', e) }
  try { if (await maybeMarkTramitePaid(chargeExternalId)) efectos.push('trámite') } catch (e) { console.error('gatillo trámite', e) }
  try { if (await maybeMarkExamPaid(chargeExternalId)) efectos.push('examen') } catch (e) { console.error('gatillo examen', e) }
  return efectos
}

// Repasa TODAS las solicitudes que esperan pago y adelanta las que ya tienen la
// cuota saldada, sin importar por qué ruta entró el dinero.
export async function barrerPagosPendientes(): Promise<{
  documentos: number; tramites: number; examenes: number; revisadas: number
}> {
  const sb = db()
  const out = { documentos: 0, tramites: 0, examenes: 0, revisadas: 0 }

  // Cada tabla con su estado de espera y su gatillo.
  const fuentes: [string, string, (c: string) => Promise<boolean>][] = [
    ['document_requests', 'payment', maybeMarkDocumentPaid],
    ['tramite_requests', 'iniciado', maybeMarkTramitePaid],
    ['exam_requests', 'pendiente_pago', maybeMarkExamPaid],
  ]

  for (const [tabla, estado, gatillo] of fuentes) {
    const { data, error } = await sb.from(tabla)
      .select('id, charge_external_id').eq('status', estado).not('charge_external_id', 'is', null)
    if (error) { console.error('barrerPagosPendientes', tabla, error.message); continue }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of ((data ?? []) as any[])) {
      out.revisadas++
      // En serie: avanzar un documento puede emitir un carné contra la CCDB de
      // ISIC, que admite tres peticiones por segundo.
      try {
        if (await gatillo(r.charge_external_id)) {
          if (tabla === 'document_requests') out.documentos++
          else if (tabla === 'tramite_requests') out.tramites++
          else out.examenes++
        }
      } catch (e) { console.error('barrerPagosPendientes', tabla, r.id, e) }
    }
  }
  return out
}
