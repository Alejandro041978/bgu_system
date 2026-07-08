import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { generateChargesForEnrollment } from '@/lib/billing'

export const revalidate = 0

// POST { enrollment_id } → genera las cuotas de la matrícula desde su plantilla. Requiere sesión.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const enrollmentId = body?.enrollment_id
  if (!enrollmentId) return NextResponse.json({ error: 'Falta enrollment_id' }, { status: 400 })

  const res = await generateChargesForEnrollment(enrollmentId)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json(res)
}
