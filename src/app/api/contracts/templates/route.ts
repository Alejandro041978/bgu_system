import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = admin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('contract_templates')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { name: string; description?: string; body: string; status?: string }
  const { name, description, body: templateBody, status = 'active' } = body

  if (!name?.trim() || !templateBody?.trim()) {
    return NextResponse.json({ error: 'Nombre y cuerpo son requeridos' }, { status: 400 })
  }

  // Extraer variables del texto {{variable_name}}
  const vars = [...templateBody.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1])
  const variables = [...new Set(vars)]

  const supabase = admin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('contract_templates')
    .insert({ name, description, body: templateBody, variables, status })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
