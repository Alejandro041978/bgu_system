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

// POST → agrega un mapeo origen→destino al esquema
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const b = await req.json() as {
    origin_course_name?: string; origin_course_code?: string; origin_credits?: number | null
    dest_course_id?: string; dest_course_name?: string
  }
  if (!b.origin_course_name) return NextResponse.json({ error: 'Falta la asignatura de origen' }, { status: 400 })
  const { data, error } = await db().from('transfer_scheme_items').insert({
    scheme_id: id, origin_course_name: b.origin_course_name,
    origin_course_code: b.origin_course_code ?? null, origin_credits: b.origin_credits ?? null,
    dest_course_id: b.dest_course_id ?? null, dest_course_name: b.dest_course_name ?? null,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
