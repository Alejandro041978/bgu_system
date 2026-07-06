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

// GET → lista de convalidaciones (cabeceras)
export async function GET() {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data } = await db().from('transfer_credits')
    .select('*, items:transfer_credit_items(id)')
    .order('created_at', { ascending: false })
  return NextResponse.json({ transfers: data ?? [] })
}

// POST → crea una convalidación (cabecera)
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json() as {
    student_id?: string; student_document?: string; student_name?: string
    origin_institution?: string; origin_program?: string
    dest_program_id?: string; scale_id?: string; notes?: string
  }
  if (!b.student_id || !b.origin_institution || !b.dest_program_id || !b.scale_id) {
    return NextResponse.json({ error: 'Faltan campos (estudiante, institución origen, programa destino, escala)' }, { status: 400 })
  }
  const { data, error } = await db().from('transfer_credits').insert({
    student_id: b.student_id, student_document: b.student_document ?? null, student_name: b.student_name ?? null,
    origin_institution: b.origin_institution, origin_program: b.origin_program ?? null,
    dest_program_id: b.dest_program_id, scale_id: b.scale_id, notes: b.notes ?? null, created_by: user.id,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
