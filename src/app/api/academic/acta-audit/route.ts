import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { auditarActas } from '@/lib/acta-audit'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → contradicciones dentro del detalle de evaluaciones de las actas. Solo lee.
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  try {
    const r = await auditarActas(db())
    return NextResponse.json({
      revisadas: r.revisadas,
      total: r.hallazgos.length,
      por_tipo: {
        descuadrada: r.hallazgos.filter(h => h.tipo === 'descuadrada').length,
        peso_incoherente: r.hallazgos.filter(h => h.tipo === 'peso_incoherente').length,
        conteo_variable: r.hallazgos.filter(h => h.tipo === 'conteo_variable').length,
      },
      hallazgos: r.hallazgos,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
