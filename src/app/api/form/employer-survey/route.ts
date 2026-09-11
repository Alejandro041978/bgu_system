import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PREGUNTAS_EMPLEADOR, ESCALA_EMPLEADOR, validarRespuestasEmpleador } from '@/lib/employer-survey'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// API PÚBLICA de la Encuesta a Empleadores (bajo /api/form/*, exenta de
// sesión: el token del enlace es la autorización). El token identifica al
// EMPLEADOR y a sus titulados asociados; una encuesta completada cubre a
// todos ellos (regla del usuario, 11/09/2026).
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!UUID.test(token)) return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
  const sb = db()
  const { data: s } = await sb.from('employer_surveys')
    .select('id, employer_name, language, completed_at').eq('id', token).maybeSingle()
  if (!s) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  // Los titulados evaluados, para que el jefe sepa de quién hablamos
  const { data: links } = await sb.from('employer_survey_students').select('student_id').eq('survey_id', token)
  const sids = (links ?? []).map((l: { student_id: string }) => String(l.student_id))
  const nombres: string[] = []
  if (sids.length) {
    const { data: stus } = await sb.from('academic_students')
      .select('id, first_name, last_name').in('id', sids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const st of (stus ?? []) as any[]) {
      nombres.push([st.first_name, st.last_name].filter(Boolean).join(' '))
    }
  }

  return NextResponse.json({
    language: s.language === 'en' ? 'en' : 'es',
    completed: !!s.completed_at,
    employer_name: s.employer_name ?? null,
    graduates: nombres,
    preguntas: PREGUNTAS_EMPLEADOR,
    escala: ESCALA_EMPLEADOR,
  })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { token?: string; answers?: Record<string, unknown> } | null
  const token = String(b?.token ?? '')
  if (!UUID.test(token) || !b?.answers || typeof b.answers !== 'object') {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }
  const sb = db()
  const { data: s } = await sb.from('employer_surveys').select('id, completed_at').eq('id', token).maybeSingle()
  if (!s) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  if (s.completed_at) return NextResponse.json({ error: 'Esta encuesta ya fue enviada.' }, { status: 409 })

  const invalido = validarRespuestasEmpleador(b.answers as Record<string, unknown>)
  if (invalido) return NextResponse.json({ error: invalido }, { status: 400 })

  // Solo se guardan claves del cuestionario (nada de payload arbitrario)
  const limpio: Record<string, unknown> = {}
  for (const p of PREGUNTAS_EMPLEADOR) {
    if (p.id in (b.answers as Record<string, unknown>)) limpio[p.id] = (b.answers as Record<string, unknown>)[p.id]
  }

  // El año académico ya viene fijado desde la creación (es el ciclo anual del
  // empleador); aquí solo se sella la completitud.
  const { error } = await sb.from('employer_surveys')
    .update({ completed_at: new Date().toISOString(), answers: limpio })
    .eq('id', token).is('completed_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
