import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST (CRON_SECRET) — recibe desde N8N la ÚLTIMA NOTA BUENA del historial de
// Moodle por alumno y aula (mdl_grade_grades_history), para restaurar las
// filas del ERP que la reestructuración de aulas dejó en 0/pendiente
// (detectado 26/08/2026; pisadas desde el 29-07). Solo ACOPIA en
// grade_restore_staging: el ensayo y la aplicación van aparte, con deshacer.
// Body: array [{ aula | courseid, idnumber, nota | finalgrade, fecha }]
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const clean = rows
    .map(r => ({
      aula: Number(r.aula ?? r.courseid),
      idnumber: String(r.idnumber ?? '').trim(),
      nota: Number(r.nota ?? r.finalgrade),
      fecha: r.fecha ? new Date(r.fecha).toISOString() : null,
    }))
    .filter(r => Number.isFinite(r.aula) && r.aula > 0 && r.idnumber && Number.isFinite(r.nota) && r.nota > 0)
  if (!clean.length) return NextResponse.json({ error: 'Ninguna fila válida' }, { status: 400 })

  const sb = db()
  let upserted = 0
  const errors: string[] = []
  for (let i = 0; i < clean.length; i += 500) {
    const wave = clean.slice(i, i + 500)
    const { error } = await sb.from('grade_restore_staging')
      .upsert(wave, { onConflict: 'aula,idnumber' })
    if (error) errors.push(error.message)
    else upserted += wave.length
  }
  return NextResponse.json({
    ok: errors.length === 0,
    recibidas: rows.length, validas: clean.length, acopiadas: upserted,
    errors: errors.slice(0, 5),
  })
}
