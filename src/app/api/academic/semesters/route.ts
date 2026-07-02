import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const yearId = req.nextUrl.searchParams.get('year_id')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db() as any).from('academic_semesters').select('*').order('start_date', { ascending: true })
  if (yearId) query = query.eq('academic_year_id', yearId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('academic_semesters')
    .insert({
      academic_year_id: body.academic_year_id,
      name: body.name,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      status: body.status || 'planning',
    })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
