import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { wdb } from '@/lib/withdrawals'

export const revalidate = 0
export const maxDuration = 120

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET ?stage=&outcome= → expedientes de retiro
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = wdb()
  const stage = req.nextUrl.searchParams.get('stage')
  const outcome = req.nextUrl.searchParams.get('outcome')

  let q = sb.from('withdrawal_requests')
    .select('*, student:academic_students(first_name, last_name, second_last_name, document_number, phone_number, email)')
    .order('requested_at', { ascending: false })
  if (stage) q = q.eq('stage', stage)
  if (outcome) q = q.eq('outcome', outcome)
  const { data, error } = await q.limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    ...r,
    student_name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    document_number: r.student?.document_number ?? null,
    phone: r.student?.phone_number ?? null,
  }))

  // Resumen por etapa y resultado (para el tablero de retención)
  const { data: all } = await sb.from('withdrawal_requests').select('stage, outcome')
  const stages: Record<string, number> = {}
  const outcomes: Record<string, number> = {}
  for (const r of (all ?? []) as { stage: string; outcome: string | null }[]) {
    stages[r.stage] = (stages[r.stage] ?? 0) + 1
    if (r.outcome) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1
  }
  return NextResponse.json({ rows, stages, outcomes })
}

// POST → abrir una solicitud. La abre Camila cuando el estudiante anuncia el
// retiro, o un humano a mano. Toma la foto del momento (deuda / días de ausencia)
// para que quien llame no lo haga a ciegas.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    student_id?: string; origin?: string; requested_type?: string
    reason?: string; objection?: string
  } | null
  // Camila entra con CRON_SECRET; un humano, con sesión.
  const isBot = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!isBot && !(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!body?.student_id) return NextResponse.json({ error: 'student_id requerido' }, { status: 400 })

  const sb = wdb()

  // Foto del momento desde el seguimiento
  const { data: tr } = await sb.from('student_tracking')
    .select('inactivity_days, balance').eq('student_id', body.student_id).maybeSingle()

  const { data, error } = await sb.from('withdrawal_requests').insert({
    student_id: body.student_id,
    origin: body.origin ?? (isBot ? 'bot' : 'manual'),
    requested_type: body.requested_type ?? null,
    reason: body.reason ?? null,
    objection: body.objection ?? null,
    inactivity_days: tr?.inactivity_days ?? null,
    balance: tr?.balance ?? null,
    stage: 'llamada_pendiente',   // nace pidiendo la llamada humana
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
