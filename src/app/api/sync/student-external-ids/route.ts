import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// One-off desde N8N: puebla academic_students.external_id con Users.Id de
// SystemActiva, cruzando por número de documento. Ese UUID es el idnumber de
// los usuarios en Moodle (verificado 6/6), así que este mapa es el puente
// Moodle → estudiante para la importación de actas. Debe correrse ANTES de
// apagar SystemActiva: después no habrá de dónde sacarlo.
//
// Body (patrón N8N con Execute Once): [{ "Id": uuid, "DocumentNumber": "..." }]
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  if (!Array.isArray(body) || !body.length) {
    return NextResponse.json({ error: 'Body debe ser un array [{Id, DocumentNumber}]' }, { status: 400 })
  }

  const sb = db()
  const studs: { id: string; document_number: string | null; external_id: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_students').select('id, document_number, external_id').range(from, from + 999)
    const rows = data ?? []
    studs.push(...rows)
    if (rows.length < 1000) break
  }
  const byDoc = new Map<string, { id: string; external_id: string | null }[]>()
  for (const s of studs) {
    const d = String(s.document_number ?? '').trim()
    if (!d) continue
    if (!byDoc.has(d)) byDoc.set(d, [])
    byDoc.get(d)!.push({ id: s.id, external_id: s.external_id })
  }

  let actualizados = 0, yaTenian = 0, sinAlumno = 0, ambiguos = 0, invalidos = 0
  const updates: { id: string; external_id: string }[] = []
  for (const r of body as { Id?: string; DocumentNumber?: string }[]) {
    const uid = String(r.Id ?? '').trim()
    const doc = String(r.DocumentNumber ?? '').trim()
    if (!uid || !doc) { invalidos++; continue }
    const cands = byDoc.get(doc) ?? []
    if (!cands.length) { sinAlumno++; continue }
    if (cands.length > 1) { ambiguos++; continue }
    if (cands[0].external_id === uid) { yaTenian++; continue }
    updates.push({ id: cands[0].id, external_id: uid })
  }

  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50)
    await Promise.all(chunk.map(u =>
      sb.from('academic_students').update({ external_id: u.external_id }).eq('id', u.id)))
    actualizados += chunk.length
  }

  return NextResponse.json({
    ok: true, recibidos: body.length, actualizados,
    ya_tenian: yaTenian, sin_alumno_en_erp: sinAlumno, documento_ambiguo: ambiguos, filas_invalidas: invalidos,
  })
}
