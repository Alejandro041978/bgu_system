import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST (CRON_SECRET) — recibe desde N8N la SUMA ARITMÉTICA de coeficientes de
// cada aula (leída de la BD de Moodle: SUM(aggregationcoef) de ítems mod
// visibles). El Auditor la usa como verdad de "pesos = 100": detecta huecos
// que la normalización del informe esconde (ej. faltan Module Tests).
// Body: array [{ aula_id | courseid, suma_coeficientes | suma }]
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await req.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])
  if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

  const sb = db()
  const now = new Date().toISOString()
  const clean = rows
    .map(r => ({
      aula_id: Number(r.aula_id ?? r.courseid),
      suma: r.suma_coeficientes ?? r.suma,
    }))
    .filter(r => Number.isFinite(r.aula_id) && r.suma != null)

  let updated = 0
  const errors: string[] = []
  for (let i = 0; i < clean.length; i += 100) {
    const wave = clean.slice(i, i + 100)
    const results = await Promise.all(wave.map(r =>
      sb.from('moodle_aula_audit')
        .update({ suma_coeficientes: Number(r.suma), coefs_sync_at: now })
        .eq('aula_id', r.aula_id)
    ))
    results.forEach((res, j) => {
      if (res.error) errors.push(`aula ${wave[j].aula_id}: ${res.error.message}`)
      else updated++
    })
  }
  return NextResponse.json({ ok: errors.length === 0, recibidas: rows.length, actualizadas: updated, errors: errors.slice(0, 5) })
}
