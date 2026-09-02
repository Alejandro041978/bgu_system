import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moodleCall, getUserByIdnumber, getUserByEmail } from '@/lib/moodle'
import { courseTotal } from '@/lib/moodle-import'
import { esItemBono } from '@/lib/grade-status'

export const maxDuration = 300

// POST (CRON_SECRET) — refresca el DESGLOSE (academic_grade_details) de actas
// puntuales leyendo el reporte por estudiante del WS de Moodle, que funciona
// aunque la matrícula esté suspendida. Existe porque el importador recorre el
// padrón del aula y el padrón solo lista activos: el detalle de un estudiante
// suspendido (p. ej. restaurado tras un avance de carrusel) queda congelado
// aunque su nota final se corrija por editor.
//
// Solo escribe si el total que Moodle reporta HOY coincide (±0.05) con el
// final_grade vigente del acta — si no coinciden, el desglose no explicaría la
// nota y se devuelve el caso sin tocar. Nunca toca academic_grades.
// Body: { external_ids: string[] } (máx 50)
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const extIds: string[] = Array.isArray(body?.external_ids) ? body.external_ids.map(String) : []
  if (!extIds.length || extIds.length > 50) {
    return NextResponse.json({ error: 'external_ids: entre 1 y 50' }, { status: 400 })
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: notas, error: e1 } = await sb.from('academic_grades')
    .select('external_id, student_id, student_name, course_id, course_code, final_grade, locked_at, moodle_course_id')
    .in('external_id', extIds)
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  const sids = [...new Set((notas ?? []).map(n => String(n.student_id)))]
  const { data: stus } = await sb.from('academic_students')
    .select('id, external_id, email, email_alt').in('id', sids)
  const stuDe = new Map((stus ?? []).map(s => [String(s.id), s]))

  const { data: dets } = await sb.from('academic_grade_details').select('id, external_id').in('external_id', extIds)
  const detDe = new Map((dets ?? []).map(d => [String(d.external_id), String(d.id)]))

  const cids = [...new Set((notas ?? []).map(n => String(n.course_id)).filter(Boolean))]
  const { data: links } = cids.length
    ? await sb.from('moodle_course_links').select('aula_id, course_id').in('course_id', cids)
    : { data: [] }
  const aulasDeCurso = new Map<string, number[]>()
  for (const l of links ?? []) {
    const k = String(l.course_id)
    if (!aulasDeCurso.has(k)) aulasDeCurso.set(k, [])
    aulasDeCurso.get(k)!.push(Number(l.aula_id))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultados: any[] = []
  for (const n of notas ?? []) {
    const quien = `${n.student_name} | ${n.course_code}`
    const res = (estado: string, extra: object = {}) =>
      resultados.push({ external_id: n.external_id, quien, estado, ...extra })

    const stu = stuDe.get(String(n.student_id))
    if (!stu) { res('sin_estudiante'); continue }
    const detId = detDe.get(String(n.external_id))
    if (!detId) { res('sin_detalle'); continue }

    let mu = await getUserByIdnumber(String(stu.id))
    if (!mu && stu.external_id) mu = await getUserByIdnumber(String(stu.external_id))
    if (!mu && stu.email) mu = await getUserByEmail(String(stu.email))
    if (!mu && stu.email_alt) mu = await getUserByEmail(String(stu.email_alt))
    if (!mu) { res('sin_cuenta_moodle'); continue }

    const candidatos = n.moodle_course_id
      ? [Number(n.moodle_course_id)]
      : (aulasDeCurso.get(String(n.course_id)) ?? [])
    if (!candidatos.length) { res('sin_aula'); continue }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let elegido: { aula: number; total: number; items: any[] } | null = null
    const descartes: string[] = []
    for (const aula of candidatos) {
      try {
        const r = await moodleCall('gradereport_user_get_grade_items', { courseid: aula, userid: mu.id }, { timeoutMs: 30_000 })
        const ug = r?.usergrades?.[0]
        const total = ug ? courseTotal(ug.gradeitems) : null
        if (total == null) { descartes.push(`aula ${aula}: sin total`); continue }
        if (Math.abs(total - Number(n.final_grade)) <= 0.05) { elegido = { aula, total, items: ug.gradeitems }; break }
        descartes.push(`aula ${aula}: total ${total} ≠ acta ${n.final_grade}`)
      } catch (err) {
        descartes.push(`aula ${aula}: ${(err as Error).message}`)
      }
    }
    if (!elegido) { res('total_no_coincide', { descartes }); continue }

    // Mismo formato que el importador (moodle-import.ts): ítems ponderados
    // como {n, pct, val%, desc} + bonos como {extra, max, val=puntos}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsUsuario = (elegido.items as any[])
      .filter(i => i.itemtype === 'mod' && (i.weightraw ?? 0) > 0 && !esItemBono(i.itemname))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsBono = (elegido.items as any[])
      .filter(i => i.itemtype === 'mod' && esItemBono(i.itemname) && Number(i.grademax ?? 0) > 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const process: any[] = itemsUsuario.map((i: any, idx: number) => {
      let val: number | null = i.graderaw ?? null
      const max = Number(i.grademax ?? 100)
      if (val != null && isFinite(max) && max > 0 && max !== 100) val = (val / max) * 100
      return {
        n: idx + 1,
        pct: i.weightraw != null ? Math.round(Number(i.weightraw) * 10000) / 100 : null,
        val: val == null ? null : Math.round(val * 100) / 100,
        desc: i.itemname ?? '',
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    itemsBono.forEach((i: any, idx: number) => {
      process.push({
        n: process.length + idx + 1,
        pct: null,
        val: i.graderaw == null ? null : Math.round(Number(i.graderaw) * 100) / 100,
        desc: i.itemname ?? '',
        extra: true,
        max: Number(i.grademax),
      })
    })

    // El acta cerrada protege la NOTA, no su desglose (misma regla que el
    // importador): en cerradas el final_grade del detalle no se toca.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = { process_grades: process }
    if (!n.locked_at) patch.final_grade = elegido.total
    const { error } = await sb.from('academic_grade_details').update(patch).eq('id', detId)
    if (error) { res('error_escritura', { error: error.message }); continue }
    res('refrescada', {
      aula: elegido.aula,
      total: elegido.total,
      items: process.length,
      bonos: process.filter(p => p.extra).map(p => `${p.val}/${p.max}`),
    })
  }

  const faltantes = extIds.filter(id => !(notas ?? []).some(n => String(n.external_id) === id))
  return NextResponse.json({
    ok: true,
    refrescadas: resultados.filter(r => r.estado === 'refrescada').length,
    resultados,
    sin_acta: faltantes,
  })
}
