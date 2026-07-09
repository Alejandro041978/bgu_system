import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { provisionStudent } from '@/lib/moodle-provision'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function ok() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return !!user
}

// POST { student_id } → asociar estudiante al grupo
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await ok())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => null)
  if (!b?.student_id) return NextResponse.json({ error: 'Falta student_id' }, { status: 400 })
  const { error } = await db().from('academic_group_students')
    .upsert({ group_id: id, student_id: b.student_id }, { onConflict: 'group_id,student_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Aprovisionamiento en Moodle (best-effort; no bloquea la membresía)
  const moodle = await provisionStudent(id, b.student_id, 'enrol').catch(() => null)
  return NextResponse.json({ ok: true, moodle })
}

// DELETE ?student_id= → quitar estudiante del grupo
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await ok())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Falta student_id' }, { status: 400 })
  const { error } = await db().from('academic_group_students').delete().eq('group_id', id).eq('student_id', studentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Desmatricular en Moodle (best-effort)
  await provisionStudent(id, studentId, 'unenrol').catch(() => null)
  return NextResponse.json({ ok: true })
}
