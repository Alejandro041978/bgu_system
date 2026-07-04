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

  const cols = 'id, first_name, last_name, second_last_name, email, phone_number, document_number, disabled'

  if (email) {
    const { data, error } = await sb.from('academic_students').select(cols).ilike('email', email)
    result.by_email = error ? { error: error.message } : (data ?? [])
  }

  if (phone) {
    const digits = phone.replace(/\D/g, '').slice(-9)
    result.searched_digits = digits
    const { data, error } = await sb.from('academic_students').select(cols).ilike('phone_number', `%${digits}%`)
    result.by_phone = error ? { error: error.message } : (data ?? [])
  }

  // Muestra una muestra de cómo lucen los teléfonos guardados
  const { data: sample } = await sb
    .from('academic_students')
    .select('first_name, phone_number')
    .not('phone_number', 'is', null)
    .limit(5)
  result.phone_samples = sample ?? []

  // Dump de TODAS las columnas de un estudiante para ver los nombres reales de campos
  const { data: anyRow } = await sb
    .from('academic_students')
    .select('*')
    .limit(1)
  result.total_students_check = anyRow ?? []
  result.columns = anyRow?.[0] ? Object.keys(anyRow[0]) : []

  return NextResponse.json(result)
}
