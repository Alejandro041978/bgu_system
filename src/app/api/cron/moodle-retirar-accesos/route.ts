import { NextRequest, NextResponse } from 'next/server'
import { moodleCall, moodleConfigured, unenrolUsersBulk } from '@/lib/moodle'

export const revalidate = 0
export const maxDuration = 300

// ---------------------------------------------------------------------------
// Retiro puntual de accesos a aulas (operación con CRON_SECRET, no es cron).
//
// Nació para el hallazgo 3 de colecciones BSBA (24/09/2026): 258 accesos de
// estudiantes que quedaron matriculados en aulas de OTRA colección al cambiar
// de colección. Recibe pares {userid, courseid} ya censados y respaldados
// (NO_CORRER_respaldo_accesos_cruzados_bba_es.json) y SUSPENDE la matrícula
// manual en esas aulas — no borra, no toca la cuenta, no toca notas.
//
// Protocolo: dry_run=true no llama a Moodle; sin dry_run aplica y luego
// VERIFICA RELEYENDO cada aula (core_enrol_get_enrolled_users onlyactive) y
// devuelve qué pares siguen activos. Las credenciales de Moodle viven solo en
// Vercel: por eso esto es un endpoint y no un script local.
// ---------------------------------------------------------------------------
type Par = { userid: number; courseid: number }

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { pares?: Par[]; dry_run?: boolean; modo?: 'notas' }
  const pares = (body.pares ?? [])
    .map(p => ({ userid: Number(p.userid), courseid: Number(p.courseid) }))
    .filter(p => Number.isFinite(p.userid) && p.userid > 0 && Number.isFinite(p.courseid) && p.courseid > 0)
  if (!pares.length) return NextResponse.json({ error: 'Sin pares válidos' }, { status: 400 })
  if (pares.length > 1000) return NextResponse.json({ error: 'Máximo 1000 pares por llamada' }, { status: 400 })

  const aulas = [...new Set(pares.map(p => p.courseid))]

  // modo 'notas' → SOLO LECTURA: ¿qué tiene calificado cada par en esa aula?
  // Sirve para comprobar, antes o después de un retiro, que ninguno de esos
  // accesos era un aula donde el estudiante estaba rindiendo de verdad
  // (pregunta del usuario, 25/09/2026).
  if (body.modo === 'notas') {
    const salida: Record<string, unknown>[] = []
    let idx = 0
    const worker = async () => {
      while (idx < pares.length) {
        const p = pares[idx++]
        try {
          const r = await moodleCall('gradereport_user_get_grade_items', { courseid: p.courseid, userid: p.userid }, { timeoutMs: 30_000 })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const items = ((r?.usergrades?.[0]?.gradeitems ?? []) as any[])
          const ci = items.find(i => i.itemtype === 'course')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fechas = items.filter(i => i.itemtype === 'mod' && i.gradedategraded).map((i: any) => Number(i.gradedategraded))
          salida.push({ ...p, items_con_nota: items.filter(i => i.itemtype === 'mod' && i.graderaw != null).length, total: ci?.graderaw ?? null, ultima_calificacion: fechas.length ? new Date(Math.max(...fechas) * 1000).toISOString().slice(0, 10) : null })
        } catch (e) { salida.push({ ...p, error: e instanceof Error ? e.message : 'error' }) }
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker))
    const conNotas = salida.filter(x => Number(x.items_con_nota ?? 0) > 0)
    return NextResponse.json({ modo: 'notas', pares: pares.length, con_notas: conNotas.length, sin_notas: salida.length - conNotas.length - salida.filter(x => x.error).length, errores: salida.filter(x => x.error).length, detalle_con_notas: conNotas, detalle: salida })
  }

  // Estado previo: qué pares están hoy activos en su aula
  const activosPorAula = new Map<number, Set<number>>()
  const leer = async () => {
    for (const a of aulas) {
      const act = await moodleCall('core_enrol_get_enrolled_users', { courseid: a, options: [{ name: 'onlyactive', value: 1 }] }, { timeoutMs: 120_000 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activosPorAula.set(a, new Set(((Array.isArray(act) ? act : []) as any[]).map(u => Number(u.id))))
    }
  }
  await leer()
  const activosAntes = pares.filter(p => activosPorAula.get(p.courseid)?.has(p.userid))
  const yaInactivos = pares.length - activosAntes.length

  if (body.dry_run !== false) {
    return NextResponse.json({ dry_run: true, pares: pares.length, aulas: aulas.length, activos_hoy: activosAntes.length, ya_inactivos: yaInactivos, nota: 'Nada aplicado. Enviar dry_run:false para suspender.' })
  }

  const errores: string[] = []
  let aplicados = 0
  for (let i = 0; i < activosAntes.length; i += 300) {
    const lote = activosAntes.slice(i, i + 300)
    try { await unenrolUsersBulk(lote); aplicados += lote.length }
    catch (e) { errores.push(`lote ${i / 300 + 1}: ${e instanceof Error ? e.message : 'error'}`) }
  }

  // Verificación releyendo
  await leer()
  const siguenActivos = activosAntes.filter(p => activosPorAula.get(p.courseid)?.has(p.userid))

  return NextResponse.json({
    dry_run: false, pares: pares.length, aulas: aulas.length,
    activos_antes: activosAntes.length, ya_inactivos: yaInactivos,
    suspendidos: aplicados, siguen_activos: siguenActivos, errores,
  })
}
