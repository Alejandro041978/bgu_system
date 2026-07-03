import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
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
