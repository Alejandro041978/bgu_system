import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getAccountStatement } from '@/lib/account-statement'
import { isSuperadmin } from '@/lib/student-identity'

export const revalidate = 0

// GET → estado de cuenta por student_id (o document_number). Requiere sesión (staff).
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const studentId = sp.get('student_id')
  const documentNumber = sp.get('document_number')
  if (!studentId && !documentNumber) {
    return NextResponse.json({ error: 'Falta student_id o document_number' }, { status: 400 })
  }

  const statement = await getAccountStatement({ studentId, documentNumber })
  // superadmin habilita acciones sensibles del estado de cuenta (descuentos)
  const superadmin = await isSuperadmin(user.id)
  return NextResponse.json({ ...statement, superadmin })
}
