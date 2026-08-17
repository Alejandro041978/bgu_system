import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { auditarActividadIW } from '@/lib/iw-activity'
import { diagnoseLinks } from '@/lib/moodle-access'
import { moodleConfigured } from '@/lib/moodle'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  try {
    return NextResponse.json(await auditarActividadIW(db()))
  } catch (e) {
    // El error se responde. Un contraste que devuelve cero cuando falla diría
    // "todos los IW son efectivos", que es justo lo contrario de para lo que está.
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo consultar' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Vincular las cuentas de Moodle que faltan.
//
// Solo 8 de los 352 IW vigentes tienen el moodle_user_id guardado, así que la
// columna "Campus" sale vacía y el veredicto se apoya únicamente en el correo.
// La señal que de verdad importa —¿sigue entrando a clases?— no se puede ver.
//
// Cada estudiante cuesta hasta tres llamadas a Moodle (idnumber, email,
// email_alt), así que 344 no caben con holgura en una sola corrida. Se procesa
// por tandas y cada vínculo se guarda al momento: volver a pulsar continúa
// donde quedó, porque los ya vinculados dejan de ser candidatos.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no está configurado en este entorno' }, { status: 400 })
  const sb = db()
  const tanda = Math.min(Math.max(Number(new URL(req.url).searchParams.get('tanda') ?? 120), 1), 400)
  try {
    const { data: wds } = await sb.from('student_withdrawals')
      .select('student_id').eq('type', 'IW').eq('status', 'vigente')
    const ids = [...new Set((wds ?? []).map((w: { student_id: string }) => String(w.student_id)))]
    if (!ids.length) return NextResponse.json({ ok: true, pendientes: 0, rows: [] })

    // Solo los que aún no tienen cuenta enlazada, y solo una tanda.
    const sinVinculo: string[] = []
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await sb.from('academic_students')
        .select('id, moodle_user_id').in('id', ids.slice(i, i + 300))
      for (const s of data ?? []) if (!s.moodle_user_id) sinVinculo.push(String(s.id))
    }
    const lote = sinVinculo.slice(0, tanda)
    const { rows, name_search } = await diagnoseLinks(sb, lote)
    return NextResponse.json({
      ok: true, name_search,
      pendientes_antes: sinVinculo.length,
      procesados: lote.length,
      quedan: Math.max(0, sinVinculo.length - lote.length),
      resumen: {
        vinculado: rows.filter(r => r.status === 'vinculado').length,
        candidato: rows.filter(r => r.status === 'candidato').length,
        ambiguo: rows.filter(r => r.status === 'ambiguo').length,
        sin_cuenta: rows.filter(r => r.status === 'sin_cuenta').length,
      },
      rows: rows.filter(r => r.status !== 'vinculado').slice(0, 60),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo vincular' }, { status: 500 })
  }
}
