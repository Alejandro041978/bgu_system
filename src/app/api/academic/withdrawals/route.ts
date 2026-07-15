import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { wdb, nextResolutionNumber, recomputeSituations } from '@/lib/withdrawals'

export const revalidate = 0
export const maxDuration = 120

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET ?type=&status= → registro de retiros
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = wdb()
  const type = req.nextUrl.searchParams.get('type')
  const status = req.nextUrl.searchParams.get('status')

  let q = sb.from('student_withdrawals')
    .select('*, student:academic_students(first_name, last_name, second_last_name, document_number, email)')
    .order('withdrawal_date', { ascending: false })
  if (type) q = q.eq('type', type)
  if (status) q = q.eq('status', status)
  const { data, error } = await q.limit(2000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    ...r,
    student_name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    document_number: r.student?.document_number ?? null,
  }))
  return NextResponse.json({ rows })
}

// POST → registrar un retiro (IW o LOA). Genera el número de resolución si no se envía.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => null) as {
    student_id?: string; type?: string; withdrawal_date?: string
    resolution_number?: string; expires_at?: string; reason?: string; note?: string
  } | null

  if (!body?.student_id || (body.type !== 'IW' && body.type !== 'LOA')) {
    return NextResponse.json({ error: 'student_id y type (IW|LOA) requeridos' }, { status: 400 })
  }
  const sb = wdb()
  const date = body.withdrawal_date || new Date().toISOString().slice(0, 10)
  const resolution = body.resolution_number || await nextResolutionNumber(sb, body.student_id, body.type, date)

  // El LOA dura un semestre: por defecto vence a los 6 meses.
  let expires = body.expires_at ?? null
  if (body.type === 'LOA' && !expires) {
    const d = new Date(date + 'T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() + 6)
    expires = d.toISOString().slice(0, 10)
  }

  const { data, error } = await sb.from('student_withdrawals').insert({
    student_id: body.student_id, type: body.type, resolution_number: resolution,
    withdrawal_date: date, expires_at: body.type === 'LOA' ? expires : null,
    reason: body.reason || null, note: body.note || null,
    status: 'vigente', source: 'erp', created_by: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recomputeSituations(sb)
  return NextResponse.json(data)
}
