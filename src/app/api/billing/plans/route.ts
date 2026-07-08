import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET → planes + catálogos para el formulario (programas, convocatorias, conceptos de cuota)
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const [{ data: plans }, { data: programs }, { data: convocatorias }, { data: concepts }] = await Promise.all([
    sb.from('billing_plans').select('*').order('created_at', { ascending: false }),
    sb.from('academic_programs').select('id, name').order('name'),
    sb.from('convocatorias').select('id, name').order('first_day', { ascending: false }),
    sb.from('account_concepts').select('type_code, abbr, name').eq('kind', 'charge').order('type_code'),
  ])
  return NextResponse.json({
    plans: plans ?? [], programs: programs ?? [], convocatorias: convocatorias ?? [], concepts: concepts ?? [],
  })
}

// POST → upsert de un plan (por program_id + convocatoria_id)
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.program_id || !b?.convocatoria_id) {
    return NextResponse.json({ error: 'Falta programa o convocatoria' }, { status: 400 })
  }
  const sb = db()
  const row = {
    program_id: b.program_id,
    convocatoria_id: b.convocatoria_id,
    currency: b.currency || 'USD',
    registration_fee: Number(b.registration_fee) || 0,
    registration_concept: b.registration_concept != null && b.registration_concept !== '' ? Number(b.registration_concept) : null,
    installments_count: Number(b.installments_count) || 0,
    installment_amount: Number(b.installment_amount) || 0,
    installment_concept: b.installment_concept != null && b.installment_concept !== '' ? Number(b.installment_concept) : null,
    first_due_date: b.first_due_date || null,
    due_day: b.due_day != null && b.due_day !== '' ? Number(b.due_day) : null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await sb.from('billing_plans').upsert(row, { onConflict: 'program_id,convocatoria_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= → elimina un plan
export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { error } = await sb.from('billing_plans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
