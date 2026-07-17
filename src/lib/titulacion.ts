import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Titulación: el egresado que recibe su título final pasa a titulado.
//
// El disparador es la EMISIÓN del documento, no la entrega física. Razones:
//   - Emitir el título es el acto institucional que lo confiere; la entrega es
//     logística y puede tardar semanas (correo, viaje).
//   - La lista histórica que existe es de quienes PAGARON la emisión, así que
//     tomar la emisión mantiene coherencia entre lo importado y lo nuevo.
//   - El estudiante ya es titulado mientras su diploma viaja.
// La entrega igual se registra (cargo de entrega), pero como hito aparte.
//
// Es por PROGRAMA: alguien puede titularse de su bachelor y seguir cursando una
// maestría, y su fila de maestría sigue como egresado/activo.
// ---------------------------------------------------------------------------
export async function marcarTitulado(
  studentId: string,
  programId: string | null,
  opts: { fecha?: string; source?: 'emision' | 'importacion' } = {},
): Promise<{ ok: boolean; created: boolean; note: string }> {
  const sb = db()
  const fecha = opts.fecha ?? new Date().toISOString().slice(0, 10)
  const source = opts.source ?? 'emision'

  const patch = {
    titulacion_status: 'titulado',
    titulado_at: fecha,
    titulacion_source: source,
  }

  // ¿Ya lo teníamos detectado como egresado de ese programa?
  let q = sb.from('student_graduations').select('id, titulacion_status').eq('student_id', studentId)
  if (programId) q = q.eq('program_id', programId)
  const { data: existing } = await q.limit(1).maybeSingle()

  if (existing) {
    await sb.from('student_graduations').update(patch).eq('id', existing.id)
    return { ok: true, created: false, note: 'Titulado sobre su egreso ya detectado' }
  }

  // No estaba como egresado. Si tiene título, ES egresado: nuestra detección lo
  // pasó por alto (falso negativo, casi siempre por notas sin sincronizar). Se
  // crea la fila igual — el título es prueba más fuerte que nuestro cálculo.
  if (!programId) return { ok: false, created: false, note: 'Sin programa: no se puede registrar el egreso' }

  const { error } = await sb.from('student_graduations').insert({
    student_id: studentId, program_id: programId,
    detected_at: fecha, ...patch,
  })
  if (error) return { ok: false, created: false, note: error.message }
  return { ok: true, created: true, note: 'No figuraba como egresado; se creó a partir del título' }
}
