import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// POST { student_ids: string[] } → genera una convalidación por estudiante con las
// asignaturas del esquema (sin nota). Omite estudiantes ya aplicados a este esquema.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const { student_ids } = await req.json() as { student_ids?: string[] }
  if (!student_ids?.length) return NextResponse.json({ error: 'Sin estudiantes' }, { status: 400 })

  const sb = db()
  const { data: scheme } = await sb.from('transfer_schemes').select('*').eq('id', id).maybeSingle()
  if (!scheme) return NextResponse.json({ error: 'Esquema no encontrado' }, { status: 404 })
  const { data: schemeItems } = await sb.from('transfer_scheme_items').select('*').eq('scheme_id', id)
  if (!schemeItems?.length) return NextResponse.json({ error: 'El esquema no tiene asignaturas' }, { status: 400 })

  // Estudiantes ya aplicados a este esquema (evita duplicar)
  const { data: existing } = await sb.from('transfer_credits').select('student_id').eq('scheme_id', id).in('student_id', student_ids)
  const already = new Set((existing ?? []).map((e: { student_id: string }) => e.student_id))

  let applied = 0
  const skipped: string[] = []
  for (const sid of student_ids) {
    if (already.has(sid)) { skipped.push(sid); continue }
    const { data: st } = await sb.from('academic_students')
      .select('first_name, last_name, second_last_name, document_number').eq('id', sid).maybeSingle()
    const name = st ? [st.first_name, st.last_name, st.second_last_name].filter(Boolean).join(' ') : null

    const { data: tc, error } = await sb.from('transfer_credits').insert({
      student_id: sid, student_document: st?.document_number ?? null, student_name: name,
      origin_institution: scheme.origin_institution, dest_program_id: scheme.dest_program_id,
      scale_id: scheme.scale_id, scheme_id: scheme.id, created_by: user.id,
    }).select('id').single()
    if (error || !tc) { skipped.push(sid); continue }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = schemeItems.map((it: any) => ({
      transfer_credit_id: tc.id, origin_course_name: it.origin_course_name,
      dest_course_id: it.dest_course_id, dest_course_name: it.dest_course_name, origin_grade: null,
    }))
    await sb.from('transfer_credit_items').insert(rows)
    applied++
  }

  return NextResponse.json({ applied, skipped: skipped.length })
}
