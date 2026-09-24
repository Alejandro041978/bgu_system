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

  const body = await req.json().catch(() => ({})) as { pares?: Par[]; dry_run?: boolean }
  const pares = (body.pares ?? [])
    .map(p => ({ userid: Number(p.userid), courseid: Number(p.courseid) }))
    .filter(p => Number.isFinite(p.userid) && p.userid > 0 && Number.isFinite(p.courseid) && p.courseid > 0)
  if (!pares.length) return NextResponse.json({ error: 'Sin pares válidos' }, { status: 400 })
  if (pares.length > 1000) return NextResponse.json({ error: 'Máximo 1000 pares por llamada' }, { status: 400 })

  const aulas = [...new Set(pares.map(p => p.courseid))]

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
