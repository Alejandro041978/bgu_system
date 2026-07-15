import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { wdb, nextResolutionNumber } from '@/lib/withdrawals'

export const revalidate = 0

// GET ?student_id=&type=IW|LOA&date= → propone el siguiente número de resolución
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const student_id = p.get('student_id')
  const type = p.get('type')
  if (!student_id || (type !== 'IW' && type !== 'LOA')) {
    return NextResponse.json({ error: 'student_id y type (IW|LOA) requeridos' }, { status: 400 })
  }
  const date = p.get('date') || new Date().toISOString().slice(0, 10)
  const resolution_number = await nextResolutionNumber(wdb(), student_id, type, date)
  return NextResponse.json({
    resolution_number,
    // Sin categoría reconocida no se puede armar el consecutivo; el usuario lo escribe a mano.
    warning: resolution_number ? null : 'No se pudo determinar la categoría del programa del estudiante. Escribe el número de resolución manualmente.',
  })
}
