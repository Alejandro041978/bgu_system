import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { analizarCobertura, completarCobertura } from '@/lib/curricular-plan'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Cobertura del registro curricular: quién no tiene su malla completa.
//
// Un matriculado debe tener en su registro las asignaturas de su programa,
// cualquiera sea su estado. Sólo un IW justifica lo contrario. Esta ruta mide
// el desvío y, con POST, lo corrige creando las filas de plan que faltan.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const categoria = req.nextUrl.searchParams.get('categoria') ?? ''
  const programa = req.nextUrl.searchParams.get('programa') ?? ''
  const filas = await analizarCobertura(db())

  const visibles = filas
    .filter(f => !categoria || f.categoria === categoria)
    .filter(f => !programa || f.program_id === programa)
    .sort((a, b) => Number(a.exenta) - Number(b.exenta) || b.faltan - a.faltan || a.estudiante.localeCompare(b.estudiante))

  const porCategoria: Record<string, { matriculas: number; exentas: number; asignaturas: number }> = {}
  for (const f of filas) {
    const c = (porCategoria[f.categoria] ??= { matriculas: 0, exentas: 0, asignaturas: 0 })
    c.matriculas++
    if (f.exenta) c.exentas++; else c.asignaturas += f.faltan
  }

  return NextResponse.json({
    resumen: porCategoria,
    total: visibles.length,
    corregibles: visibles.filter(f => !f.exenta).length,
    asignaturas: visibles.filter(f => !f.exenta).reduce((s, f) => s + f.faltan, 0),
    // Los huecos completos pesan mucho y no se pintan: basta el conteo.
    filas: visibles.map(({ huecos, ...f }) => ({ ...f, ejemplo: huecos.slice(0, 3).map(h => h.name) })),
  })
}

// POST { enrollment_ids } → crea las filas de plan que faltan.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const b = await req.json().catch(() => null) as { enrollment_ids?: string[] } | null
  const ids = new Set(b?.enrollment_ids ?? [])
  if (!ids.size) return NextResponse.json({ error: 'No hay matrículas seleccionadas' }, { status: 400 })

  // Un IW no se completa ni pidiéndolo: su registro está incompleto por una
  // razón, y llenarlo borraría esa información. completarCobertura lo respeta.
  const r = await completarCobertura(db(), m => ids.has(m.enrollment_id))
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ ok: true, matriculas: r.matriculas, asignaturas: r.asignaturas, omitidas_por_iw: r.omitidas_por_iw })
}
