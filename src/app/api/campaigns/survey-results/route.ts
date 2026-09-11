import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPagina } from '@/lib/page-guard'
import { PREGUNTAS } from '@/lib/graduate-survey'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Resultados de la Encuesta de Titulados EN TIEMPO REAL, por año académico:
// el resultado del año = todas las encuestas completadas dentro de ese año
// (regla del usuario, 10/09/2026). La encuesta es nominal, así que los cruces
// salen de la ficha: aquí van los cortes por categoría y país; el detalle
// individual queda en la base para cruces futuros.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardPagina('campaign_survey_titulados', 'view')
  if (noAutorizado) return noAutorizado
  const sb = db()

  const { data: anios } = await sb.from('academic_years')
    .select('id, name, start_date, end_date').order('start_date')
  const hoy = new Date().toISOString().slice(0, 10)
  const pedido = req.nextUrl.searchParams.get('academic_year_id')
  const anio = (pedido ? (anios ?? []).find((y: { id: string }) => y.id === pedido) : null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?? (anios ?? []).find((y: any) => y.start_date <= hoy && hoy <= y.end_date)
    ?? (anios ?? [])[(anios ?? []).length - 1]
  if (!anio) return NextResponse.json({ error: 'Sin años académicos configurados' }, { status: 409 })

  // Completadas del año + invitaciones vivas (para la tasa de respuesta)
  const { data: completadas } = await sb.from('graduate_surveys')
    .select('id, student_id, answers, completed_at, language')
    .eq('academic_year_id', anio.id).not('completed_at', 'is', null)
  const { count: invitados } = await sb.from('graduate_surveys')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', anio.start_date + 'T00:00:00Z').lte('created_at', anio.end_date + 'T23:59:59Z')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = (completadas ?? []) as any[]

  // Cruces desde la ficha: país del estudiante; programa/categoría del título
  const sids = [...new Set(filas.map(f => String(f.student_id)))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fichaDe = new Map<string, any>()
  for (let i = 0; i < sids.length; i += 200) {
    const { data } = await sb.from('academic_students').select('id, country').in('id', sids.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) fichaDe.set(String(s.id), s)
  }
  const { data: degrees } = sids.length
    ? await sb.from('degree_files').select('student_id, program:academic_programs(name, category:academic_programs_category(name))').in('student_id', sids)
    : { data: [] }
  const programaDe = new Map<string, { programa: string; categoria: string }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (degrees ?? []) as any[]) {
    if (!programaDe.has(String(d.student_id))) {
      programaDe.set(String(d.student_id), {
        programa: d.program?.name ?? '—', categoria: d.program?.category?.name ?? '—',
      })
    }
  }
  const conteo = (fn: (sid: string) => string) => {
    const m = new Map<string, number>()
    for (const f of filas) { const k = fn(String(f.student_id)) || '—'; m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }))
  }

  // Agregado por pregunta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultados: any[] = []
  for (const p of PREGUNTAS) {
    const valores = filas.map(f => f.answers?.[p.id]).filter(v => v != null && v !== '')
    if (p.tipo === 'likert') {
      const nums = valores.map(Number).filter(n => Number.isFinite(n))
      const dist = [1, 2, 3, 4, 5].map(n => nums.filter(x => x === n).length)
      resultados.push({
        id: p.id, tipo: p.tipo, seccion: p.seccion, texto: p.es,
        n: nums.length,
        promedio: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null,
        distribucion: dist,
      })
    } else if (p.tipo === 'choice' || p.tipo === 'multi') {
      const cuenta = new Map<string, number>()
      for (const v of valores) {
        for (const x of Array.isArray(v) ? v : [v]) cuenta.set(String(x), (cuenta.get(String(x)) ?? 0) + 1)
      }
      resultados.push({
        id: p.id, tipo: p.tipo, seccion: p.seccion, texto: p.es, n: valores.length,
        opciones: (p.opciones ?? []).map(o => ({ id: o.id, texto: o.es, n: cuenta.get(o.id) ?? 0 })),
      })
    }
    // Los campos de texto (empresa, puesto, jefe) no se agregan: son datos de
    // verificación, visibles en la base para quien los necesite.
  }

  return NextResponse.json({
    anio: { id: anio.id, name: anio.name },
    anios: (anios ?? []).map((y: { id: string; name: string }) => ({ id: y.id, name: y.name })),
    completadas: filas.length,
    invitados: invitados ?? 0,
    tasa_respuesta: (invitados ?? 0) > 0 ? Math.round((filas.length / (invitados ?? 1)) * 1000) / 10 : 0,
    por_categoria: conteo(sid => programaDe.get(sid)?.categoria ?? '—'),
    por_programa: conteo(sid => programaDe.get(sid)?.programa ?? '—'),
    por_pais: conteo(sid => fichaDe.get(sid)?.country ?? '—'),
    resultados,
  })
}
