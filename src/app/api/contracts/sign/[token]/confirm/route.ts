import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { code } = await req.json() as { code: string }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  const userAgent = req.headers.get('user-agent') ?? 'unknown'

  const supabase = admin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: instance } = await (supabase as any)
    .from('contract_instances')
    .select('id, status, token_expires_at')
    .eq('token', token)
    .single()

  if (!instance) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
  if (instance.status === 'signed') return NextResponse.json({ error: 'Ya firmado' }, { status: 400 })
  if (new Date(instance.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'El enlace ha expirado' }, { status: 400 })
  }

  // Verificar OTP
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: otp } = await (supabase as any)
    .from('contract_otp')
    .select('id, expires_at, used')
    .eq('contract_instance_id', instance.id)
    .eq('code', code)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!otp) return NextResponse.json({ error: 'Código incorrecto' }, { status: 400 })
  if (new Date(otp.expires_at) < new Date()) {
    return NextResponse.json({ error: 'El código ha expirado, solicita uno nuevo' }, { status: 400 })
  }

  // Marcar OTP como usado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('contract_otp').update({ used: true }).eq('id', otp.id)

  // Registrar firma
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('contract_instances')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      ip_address: ip,
      user_agent: userAgent,
    })
    .eq('id', instance.id)

  return NextResponse.json({ ok: true })
}
