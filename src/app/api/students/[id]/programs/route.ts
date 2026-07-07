import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → programas en los que el estudiante está matriculado (academic_student_enrollments)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const sb = db()

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('program_id, term_year, term_block').eq('student_id', id)

  const programIds = [...new Set((enr ?? []).map((e: { program_id: string }) => e.program_id).filter(Boolean))]
  if (programIds.length === 0) return NextResponse.json({ programs: [] })

  const { data: programs } = await sb.from('academic_programs')
    .select('id, name, code, category_id').in('id', programIds).order('name')

  return NextResponse.json({ programs: programs ?? [] })
}
