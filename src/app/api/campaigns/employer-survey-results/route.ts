import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardPagina } from '@/lib/page-guard'
import { PREGUNTAS_EMPLEADOR } from '@/lib/employer-survey'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Resultados de la Encuesta a Empleadores EN TIEMPO REAL, por año académico.
// Una encuesta = un EMPLEADOR (puede cubrir varios titulados); los cortes por
// categoría/programa/sexo/país se cuentan por TITULADO CUBIERTO, que es la
// unidad que interesa a los reportes institucionales. Las tres abiertas
// (fortalezas, debilidades, cursos que faltaron) se listan tal cual: son el
// oro cualitativo de esta encuesta.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardPagina('campaign_survey_empleadores', 'view')
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

  const { data: filasAnio } = await sb.from('employer_surveys')
    .select('id, employer_name, company, completed_at, answers, language')
    .eq('academic_year_id', anio.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todas = (filasAnio ?? []) as any[]
  const completadas = todas.filter(f => f.completed_at)

  // Titulados cubiertos por las encuestas COMPLETADAS del año
  const surveyIds = completadas.map(f => String(f.id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const links: any[] = []
  for (let i = 0; i < surveyIds.length; i += 200) {
    const { data } = await sb.from('employer_survey_students')
      .select('survey_id, student_id').in('survey_id', surveyIds.slice(i, i + 200))
    links.push(...(data ?? []))
  }
  const sids = [...new Set(links.map(l => String(l.student_id)))]

  // Cruces desde la ficha del titulado (mismo patrón que la encuesta de
  // titulados: degree_files no tiene FK a programas, el join es manual)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fichaDe = new Map<string, any>()
  for (let i = 0; i < sids.length; i += 200) {
    let { data } = await sb.from('academic_students').select('id, country, sex').in('id', sids.slice(i, i + 200))
    if (!data) ({ data } = await sb.from('academic_students').select('id, country').in('id', sids.slice(i, i + 200)))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) fichaDe.set(String(s.id), s)
  }
  const { data: degrees } = sids.length
    ? await sb.from('degree_files').select('student_id, program_id').in('student_id', sids)
    : { data: [] }
  const progIds = [...new Set(((degrees ?? []) as { program_id: string | null }[]).map(d => d.program_id).filter(Boolean).map(String))]
  const { data: progs } = progIds.length
    ? await sb.from('academic_programs').select('id, name, category_id').in('id', progIds)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catIds = [...new Set(((progs ?? []) as any[]).map(p => p.category_id).filter(Boolean).map(String))]
  const { data: cats } = catIds.length
    ? await sb.from('academic_programs_category').select('id, name').in('id', catIds)
    : { data: [] }
  const catDe = new Map(((cats ?? []) as { id: string; name: string }[]).map(c => [String(c.id), c.name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progDe = new Map(((progs ?? []) as any[]).map(p => [String(p.id), p]))
  const programaDe = new Map<string, { programa: string; categoria: string }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (degrees ?? []) as any[]) {
    if (programaDe.has(String(d.student_id))) continue
    const p = d.program_id ? progDe.get(String(d.program_id)) : null
    programaDe.set(String(d.student_id), {
      programa: p?.name ?? '—',
      categoria: (p?.category_id ? catDe.get(String(p.category_id)) : null) ?? '—',
    })
  }
  const conteo = (fn: (sid: string) => string) => {
    const m = new Map<string, number>()
    for (const sid of sids) { const k = fn(sid) || '—'; m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }))
  }

  // Agregado por pregunta (una respuesta por EMPLEADOR)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultados: any[] = []
  for (const p of PREGUNTAS_EMPLEADOR) {
    const valores = completadas.map(f => f.answers?.[p.id]).filter(v => v != null && v !== '')
    if (p.tipo === 'likert') {
      const nums = valores.map(Number).filter(n => Number.isFinite(n))
      const dist = [1, 2, 3, 4, 5].map(n => nums.filter(x => x === n).length)
      resultados.push({
        id: p.id, tipo: 'likert', texto: p.es, n: nums.length,
        promedio: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null,
        distribucion: dist,
      })
    } else if (p.tipo === 'choice') {
      const cuenta = new Map<string, number>()
      for (const v of valores) cuenta.set(String(v), (cuenta.get(String(v)) ?? 0) + 1)
      resultados.push({
        id: p.id, tipo: 'choice', texto: p.es, n: valores.length,
        opciones: (p.opciones ?? []).map(o => ({ id: o.id, texto: o.es, n: cuenta.get(o.id) ?? 0 })),
      })
    } else {
      // Las abiertas se LISTAN (con la empresa que lo dijo): es el material
      // cualitativo por el que existe esta encuesta.
      resultados.push({
        id: p.id, tipo: 'parrafo', texto: p.es, n: valores.length,
        respuestas: completadas
          .filter(f => f.answers?.[p.id])
          .map(f => ({ texto: String(f.answers[p.id]).slice(0, 500), empresa: f.company ?? f.employer_name ?? '—' }))
          .slice(0, 50),
      })
    }
  }

  return NextResponse.json({
    anio: { id: anio.id, name: anio.name },
    anios: (anios ?? []).map((y: { id: string; name: string }) => ({ id: y.id, name: y.name })),
    completadas: completadas.length,
    invitados: todas.length,
    titulados_cubiertos: sids.length,
    tasa_respuesta: todas.length > 0 ? Math.round((completadas.length / todas.length) * 1000) / 10 : 0,
    por_categoria: conteo(sid => programaDe.get(sid)?.categoria ?? '—'),
    por_programa: conteo(sid => programaDe.get(sid)?.programa ?? '—'),
    por_sexo: conteo(sid => ({ M: 'Masculino', F: 'Femenino' } as Record<string, string>)[fichaDe.get(sid)?.sex] ?? 'Sin clasificar'),
    por_pais: conteo(sid => fichaDe.get(sid)?.country ?? '—'),
    resultados,
  })
}
