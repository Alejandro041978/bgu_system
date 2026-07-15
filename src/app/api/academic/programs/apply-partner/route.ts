import { NextResponse } from 'next/server'
import { wdb, recomputeSituations } from '@/lib/withdrawals'

export const maxDuration = 120

// POST → recalcula las situaciones tras marcar/desmarcar programas de campus socio.
// La lógica vive en recomputeSituations (retiros vigentes > campus socio > activo).
export async function POST() {
  const counts = await recomputeSituations(wdb())
  return NextResponse.json({
    eligible_students: counts.campus_socio,
    marked: counts.updated,
    reverted: 0,
    situations: counts,
  })
}
