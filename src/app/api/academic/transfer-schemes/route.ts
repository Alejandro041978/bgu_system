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

// GET → lista de esquemas de convalidación masiva
export async function GET() {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data } = await db().from('transfer_schemes')
    .select('*, items:transfer_scheme_items(id)')
    .order('created_at', { ascending: false })
  return NextResponse.json({ schemes: data ?? [] })
}

// POST → crea un esquema (cabecera)
export async function POST(req: NextRequest) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json() as {
    name?: string; origin_institution?: string; dest_program_id?: string; scale_id?: string
  }
  if (!b.name || !b.origin_institution || !b.dest_program_id || !b.scale_id) {
    return NextResponse.json({ error: 'Faltan campos (nombre, institución origen, programa destino, escala)' }, { status: 400 })
  }
  const { data, error } = await db().from('transfer_schemes').insert({
    name: b.name, origin_institution: b.origin_institution,
    dest_program_id: b.dest_program_id, scale_id: b.scale_id,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
