import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/sofia/debug-student?email=... | ?phone=...
// Muestra cómo está guardado el estudiante para diagnosticar el reconocimiento.
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')
  const phone = req.nextUrl.searchParams.get('phone')
  const sb = db() as any

  const result: Record<string, unknown> = {}

  if (email) {
    const { data } = await sb
      .from('academic_students')
      .select('id, full_name, email, phone, student_code, disabled')
      .ilike('email', email)
    result.by_email = data ?? []
  }

  if (phone) {
    const digits = phone.replace(/\D/g, '').slice(-9)
    result.searched_digits = digits
    const { data } = await sb
      .from('academic_students')
      .select('id, full_name, email, phone, student_code, disabled')
      .ilike('phone', `%${digits}%`)
    result.by_phone = data ?? []
  }

  // Muestra una muestra de cómo lucen los teléfonos guardados
  const { data: sample } = await sb
    .from('academic_students')
    .select('full_name, phone')
    .not('phone', 'is', null)
    .limit(5)
  result.phone_samples = sample ?? []

  return NextResponse.json(result)
}
