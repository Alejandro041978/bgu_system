import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { observar } from '@/lib/api-observe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  await observar(req, '/api/students/check-email')

  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ exists: false })

  const { data } = await (supabase as any)
    .from('academic_students')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .eq('disabled', false)
    .maybeSingle()

  return NextResponse.json({ exists: !!data })
}
