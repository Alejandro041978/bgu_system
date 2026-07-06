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

// GET → escalas de conversión + categorías (con su nota de aprobación de destino)
export async function GET() {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const [{ data: scales }, { data: categories }] = await Promise.all([
    sb.from('grade_scales').select('*').order('name'),
    sb.from('academic_programs_category').select('id, name, passing_score').order('name'),
  ])
  return NextResponse.json({ scales: scales ?? [], categories: categories ?? [] })
}

// POST → crea una escala de conversión
export async function POST(req: NextRequest) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json() as {
    name?: string; country?: string
    origin_min?: number; origin_max?: number; origin_passing?: number
  }
  if (!b.name || b.origin_min == null || b.origin_max == null || b.origin_passing == null) {
    return NextResponse.json({ error: 'Faltan campos (nombre, min, max, aprobación)' }, { status: 400 })
  }
  if (b.origin_max <= b.origin_min || b.origin_passing < b.origin_min || b.origin_passing > b.origin_max) {
    return NextResponse.json({ error: 'Rango inválido: revisa min < aprobación ≤ max' }, { status: 400 })
  }
  const { data, error } = await db().from('grade_scales').insert({
    name: b.name, country: b.country ?? null,
    origin_min: b.origin_min, origin_max: b.origin_max, origin_passing: b.origin_passing,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
