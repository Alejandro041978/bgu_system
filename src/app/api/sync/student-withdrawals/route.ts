import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// El tipo de retiro está codificado en el número de resolución de SystemActiva:
//   "074-2025/2026-IW-BACHELOR" → IW (permanente)
//   "...-LOA-..."               → LOA (temporal)  (aún no aparece en los datos)
function typeOf(resolution?: string | null): 'retiro_permanente' | 'retiro_temporal' {
  const r = (resolution ?? '').toUpperCase()
  if (r.includes('LOA')) return 'retiro_temporal'
  return 'retiro_permanente' // IW y los "sin patrón" → retiro permanente por defecto
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(sb: any, table: string, cols: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from(table).select(cols).range(from, from + 999)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// POST (desde N8N, Bearer CRON_SECRET) con retiros de SystemActiva:
//   [{ enrollment_id, withdrawal_date, resolution }]
// Un estudiante queda como retirado sólo si TODAS sus matrículas están retiradas
// (si conserva alguna matrícula activa, sigue 'activo'). Nunca sobrescribe una
// situación puesta manualmente (situation_source = 'manual').
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Se espera un arreglo [{enrollment_id, withdrawal_date, resolution}]' }, { status: 400 })
  }

  const sb = db()

  // 1) Todas las matrículas: enrollment_id → student_id, y total por estudiante
  const enrolls = await readAll(sb, 'academic_student_enrollments', 'id, student_id')
  const studentOfEnroll = new Map<string, string>()
  const totalByStudent = new Map<string, number>()
  for (const e of enrolls as { id: string; student_id: string | null }[]) {
    if (!e.id || !e.student_id) continue
    studentOfEnroll.set(e.id, e.student_id)
    totalByStudent.set(e.student_id, (totalByStudent.get(e.student_id) ?? 0) + 1)
  }

  // 2) Agrupar retiros por estudiante (nos quedamos con el más reciente para la resolución)
  type W = { date: string | null; resolution: string | null }
  const withdrawnByStudent = new Map<string, { count: number; latest: W }>()
  for (const rec of body as { enrollment_id?: string; withdrawal_date?: string; resolution?: string }[]) {
    const sid = rec.enrollment_id ? studentOfEnroll.get(rec.enrollment_id) : undefined
    if (!sid) continue
    const cur = withdrawnByStudent.get(sid) ?? { count: 0, latest: { date: null, resolution: null } }
    cur.count += 1
    const d = rec.withdrawal_date ?? null
    if (!cur.latest.date || (d && d > cur.latest.date)) cur.latest = { date: d, resolution: rec.resolution ?? null }
    withdrawnByStudent.set(sid, cur)
  }

  // 3) Estudiantes totalmente retirados (todas sus matrículas retiradas)
  const retiredNow = new Map<string, { situation: string; date: string | null; resolution: string | null }>()
  for (const [sid, w] of withdrawnByStudent) {
    const total = totalByStudent.get(sid) ?? 0
    if (total > 0 && w.count >= total) {
      retiredNow.set(sid, { situation: typeOf(w.latest.resolution), date: w.latest.date, resolution: w.latest.resolution })
    }
  }

  // 4) Aplicar retiros (sólo donde no haya override manual)
  let updated = 0
  const entries = [...retiredNow.entries()]
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50)
    await Promise.all(chunk.map(([sid, v]) =>
      sb.from('academic_students')
        .update({ situation: v.situation, situation_source: 'auto', withdrawal_date: v.date, withdrawal_resolution: v.resolution })
        .eq('id', sid).eq('situation_source', 'auto')
    ))
    updated += chunk.length
  }

  // 5) Revertir retiros 'auto' que ya no aplican (matrícula reactivada): volver a 'activo'
  let reverted = 0
  const autoRetired = await readAll(sb, 'academic_students', 'id, situation, situation_source')
  const toRevert = (autoRetired as { id: string; situation: string; situation_source: string }[])
    .filter(s => s.situation_source === 'auto'
      && (s.situation === 'retiro_permanente' || s.situation === 'retiro_temporal')
      && !retiredNow.has(s.id))
    .map(s => s.id)
  for (let i = 0; i < toRevert.length; i += 50) {
    const chunk = toRevert.slice(i, i + 50)
    await Promise.all(chunk.map(id =>
      sb.from('academic_students')
        .update({ situation: 'activo', withdrawal_date: null, withdrawal_resolution: null })
        .eq('id', id).eq('situation_source', 'auto')
    ))
    reverted += chunk.length
  }

  return NextResponse.json({
    received: body.length,
    matched_enrollments: [...withdrawnByStudent.values()].reduce((a, w) => a + w.count, 0),
    retired_students: retiredNow.size,
    updated,
    reverted,
  })
}
