import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { auditarActas } from '@/lib/acta-audit'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → actas cuyas ponderaciones no suman 100, agrupadas por asignatura. Solo lee.
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  try {
    const r = await auditarActas(db())
    return NextResponse.json({
      revisadas: r.revisadas,
      actas_mal: r.actas_mal,
      total: r.hallazgos.length,
      hallazgos: r.hallazgos,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
