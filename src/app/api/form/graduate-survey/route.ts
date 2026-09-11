import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PREGUNTAS, SECCIONES, validarRespuestas } from '@/lib/graduate-survey'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const esUuid = (t: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)

// ---------------------------------------------------------------------------
// Encuesta pública de titulados. El token (uuid de graduate_surveys) identifica
// al estudiante — nominal por decisión de Dirección (10/09/2026): habilita los
// cruces por programa/categoría/país. El formulario NO expone datos del
// estudiante más allá de su primer nombre para el saludo.
// GET ?token= → estado + cuestionario en su idioma. POST {token, answers}.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const token = String(req.nextUrl.searchParams.get('token') ?? '')
  if (!esUuid(token)) return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  const sb = db()
  const { data: s } = await sb.from('graduate_surveys')
    .select('id, language, completed_at, student:academic_students(first_name)').eq('id', token).maybeSingle()
  if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({
    language: s.language ?? 'es',
    completed: !!s.completed_at,
    first_name: String(s.student?.first_name ?? '').split(' ')[0] || null,
    secciones: SECCIONES,
    preguntas: PREGUNTAS,
  })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { token?: string; answers?: Record<string, unknown> } | null
  const token = String(b?.token ?? '')
  if (!esUuid(token) || !b?.answers) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  const sb = db()
  const { data: s } = await sb.from('graduate_surveys').select('id, completed_at').eq('id', token).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Encuesta no encontrada' }, { status: 404 })
  if (s.completed_at) return NextResponse.json({ error: 'Esta encuesta ya fue enviada. ¡Gracias!' }, { status: 409 })

  const errorValidacion = validarRespuestas(b.answers as Record<string, unknown>)
  if (errorValidacion) return NextResponse.json({ error: errorValidacion }, { status: 400 })

  // El año académico del RESULTADO es el de la fecha de completación.
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: anio } = await sb.from('academic_years')
    .select('id').lte('start_date', hoy).gte('end_date', hoy).limit(1).maybeSingle()

  const { error } = await sb.from('graduate_surveys').update({
    completed_at: new Date().toISOString(),
    academic_year_id: anio?.id ?? null,
    answers: b.answers,
  }).eq('id', token).is('completed_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
