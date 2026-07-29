import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getEffectiveStudent } from '@/lib/student-identity'
import { simulate, calcular, getSettings, type Cuota } from '@/lib/cashpay'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveStudent(sb: any, ident: { email: string | null; document_number: string | null }) {
  if (ident.email) {
    const { data } = await sb.from('academic_students').select('id, first_name, last_name').eq('email', ident.email).eq('disabled', false).maybeSingle()
    if (data) return data
  }
  if (ident.document_number) {
    const { data } = await sb.from('academic_students').select('id, first_name, last_name').eq('document_number', ident.document_number).maybeSingle()
    if (data) return data
  }
  return null
}

// GET → simulación con SUS cuotas reales + su solicitud vigente si la hay
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'No es un estudiante' }, { status: 403 })
  const sb = db()
  const stu = await resolveStudent(sb, ident)
  if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  const sim = await simulate(sb, stu.id)
  const { data: solicitud } = await sb.from('cashpay_requests')
    .select('id, status, months, discount_pct, gross_amount, discount_amount, net_amount, requested_at, expires_at, review_note')
    .eq('student_id', stu.id).in('status', ['pendiente', 'aprobada'])
    .order('requested_at', { ascending: false }).limit(1).maybeSingle()

  return NextResponse.json({ ...sim, solicitud: solicitud ?? null })
}

// POST { charges: string[] } → registra la SOLICITUD con la cotización congelada.
// No aplica ningún descuento: eso lo decide cobranza.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'No es un estudiante' }, { status: 403 })
  const b = await req.json().catch(() => null) as { charges?: string[] } | null
  const pedidas = b?.charges ?? []
  if (!pedidas.length) return NextResponse.json({ error: 'Elige las cuotas que quieres adelantar' }, { status: 400 })

  const sb = db()
  const stu = await resolveStudent(sb, ident)
  if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  // Se recalcula en el SERVIDOR con sus cuotas reales: nunca se confía en el
  // monto que venga del navegador.
  const sim = await simulate(sb, stu.id)
  if (!sim.elegible) return NextResponse.json({ error: sim.motivo }, { status: 400 })
  const cuotas: Cuota[] = sim.futuras.filter(c => pedidas.includes(c.external_id))
  if (!cuotas.length) return NextResponse.json({ error: 'Las cuotas elegidas ya no están disponibles' }, { status: 400 })

  const { data: previa } = await sb.from('cashpay_requests')
    .select('id').eq('student_id', stu.id).eq('status', 'pendiente').limit(1).maybeSingle()
  if (previa) return NextResponse.json({ error: 'Ya tienes una solicitud en revisión. Un asesor se comunicará contigo.' }, { status: 400 })

  const s = await getSettings(sb)
  const calc = calcular(cuotas, s)
  if (!calc) return NextResponse.json({ error: 'No se pudo calcular el beneficio' }, { status: 400 })

  const expires = new Date(Date.now() + Number(s.quote_valid_days) * 86400000).toISOString()
  const { data: ins, error } = await sb.from('cashpay_requests').insert({
    student_id: stu.id, charges: cuotas.map(c => c.external_id),
    months: calc.months, discount_pct: calc.discount_pct,
    gross_amount: calc.gross, discount_amount: calc.discount, net_amount: calc.net,
    settings_id: s.id || null, expires_at: expires,
  }).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: ins?.id, ...calc, expires_at: expires })
}
