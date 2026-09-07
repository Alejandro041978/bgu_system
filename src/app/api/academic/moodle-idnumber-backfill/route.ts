import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moodleConfigured, getMoodleUsersByIds, setUserIdnumber } from '@/lib/moodle'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST (CRON_SECRET) — escribe la llave canónica del puente (el UUID del
// estudiante) en las cuentas Moodle de los estudiantes NATIVOS del ERP que
// nacieron sin idnumber: el aprovisionamiento las creaba con
// `idnumber: external_id ?? undefined`, y un nativo no tiene external_id.
// Sin llave, el importador no los cruza y ninguna nota fluye (92 cursando
// así — caso Casanova, 07/09/2026).
//
// Regla del usuario: el ÚNICO vínculo que se escribe es el uuid. Una cuenta
// que ya tenga CUALQUIER idnumber no se toca: se reporta como conflicto si no
// coincide con el uuid, para revisarla a mano.
// Body opcional: { dry_run: true } — censo sin escribir.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 503 })
  const b = await req.json().catch(() => ({})) as { dry_run?: boolean }
  const sb = db()

  const { data: nativos } = await sb.from('academic_students')
    .select('id, first_name, last_name, moodle_user_id')
    .is('external_id', null).not('moodle_user_id', 'is', null)

  const resultados = { escritos: [] as string[], ya_correctos: 0, conflictos: [] as string[], sin_cuenta_moodle: [] as string[], errores: [] as string[] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = (nativos ?? []) as any[]
  for (let i = 0; i < filas.length; i += 20) {
    const lote = filas.slice(i, i + 20)
    let cuentas
    try { cuentas = await getMoodleUsersByIds(lote.map(s => Number(s.moodle_user_id))) }
    catch (e) { resultados.errores.push(`lote ${i}: ${e instanceof Error ? e.message : 'error WS'}`); continue }
    const porId = new Map(cuentas.map(c => [c.id, c]))
    for (const s of lote) {
      const nombre = `${s.first_name} ${s.last_name}`
      const mu = porId.get(Number(s.moodle_user_id))
      if (!mu) { resultados.sin_cuenta_moodle.push(`${nombre} (moodle_user_id ${s.moodle_user_id} no existe)`); continue }
      if (mu.idnumber === String(s.id)) { resultados.ya_correctos++; continue }
      if (mu.idnumber) { resultados.conflictos.push(`${nombre}: cuenta ${mu.id} ya tiene idnumber "${mu.idnumber}" ≠ uuid — no se toca`); continue }
      if (b.dry_run) { resultados.escritos.push(`(ensayo) ${nombre} → ${s.id}`); continue }
      try {
        await setUserIdnumber(mu.id, String(s.id))
        resultados.escritos.push(`${nombre} → ${s.id}`)
      } catch (e) {
        resultados.errores.push(`${nombre}: ${e instanceof Error ? e.message : 'error WS'}`)
      }
    }
  }
  return NextResponse.json({
    ok: true, dry_run: !!b.dry_run, nativos_con_cuenta: filas.length,
    escritos: resultados.escritos.length, ya_correctos: resultados.ya_correctos,
    conflictos: resultados.conflictos, sin_cuenta_moodle: resultados.sin_cuenta_moodle,
    errores: resultados.errores, detalle_escritos: resultados.escritos,
  })
}
