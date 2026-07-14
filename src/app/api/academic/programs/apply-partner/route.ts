import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(sb: any, table: string, cols: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from(table).select(cols).range(from, from + 999)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// POST → recalcula situation='campus_socio' según los programas marcados como
// partner_campus. Un estudiante es campus_socio si TODAS sus matrículas están
// en programas de socio (si estudia también un programa nuestro, sigue activo).
// Sólo toca estudiantes 'activo'/auto (no pisa retiros ni etiquetas manuales) y
// revierte a 'activo' los campus_socio/auto que ya no aplican.
export async function POST() {
  const sb = db()

  // 1) Programas de socio
  const partnerPrograms = await readAll(sb, 'academic_programs', 'id, partner_campus')
  const partnerIds = new Set<string>(
    (partnerPrograms as { id: string; partner_campus: boolean }[])
      .filter(p => p.partner_campus).map(p => p.id))

  // 2) Matrículas: total y en programa socio por estudiante
  const enrolls = await readAll(sb, 'academic_student_enrollments', 'student_id, program_id')
  const total = new Map<string, number>()
  const inPartner = new Map<string, number>()
  for (const e of enrolls as { student_id: string | null; program_id: string | null }[]) {
    if (!e.student_id) continue
    total.set(e.student_id, (total.get(e.student_id) ?? 0) + 1)
    if (e.program_id && partnerIds.has(e.program_id)) inPartner.set(e.student_id, (inPartner.get(e.student_id) ?? 0) + 1)
  }
  const eligible = new Set<string>()
  for (const [sid, t] of total) if (t > 0 && (inPartner.get(sid) ?? 0) >= t) eligible.add(sid)

  // 3) Situación actual de todos
  const studs = await readAll(sb, 'academic_students', 'id, situation, situation_source')
  const toMark: string[] = []   // activo/auto → campus_socio
  const toRevert: string[] = [] // campus_socio/auto que ya no aplica → activo
  for (const s of studs as { id: string; situation: string; situation_source: string }[]) {
    if (s.situation_source !== 'auto') continue
    if (eligible.has(s.id)) {
      if (s.situation === 'activo') toMark.push(s.id)
    } else if (s.situation === 'campus_socio') {
      toRevert.push(s.id)
    }
  }

  // 4) Aplicar
  let marked = 0, reverted = 0
  for (let i = 0; i < toMark.length; i += 50) {
    const chunk = toMark.slice(i, i + 50)
    await Promise.all(chunk.map(id => sb.from('academic_students')
      .update({ situation: 'campus_socio', situation_source: 'auto' }).eq('id', id).eq('situation_source', 'auto')))
    marked += chunk.length
  }
  for (let i = 0; i < toRevert.length; i += 50) {
    const chunk = toRevert.slice(i, i + 50)
    await Promise.all(chunk.map(id => sb.from('academic_students')
      .update({ situation: 'activo', situation_source: 'auto' }).eq('id', id).eq('situation_source', 'auto')))
    reverted += chunk.length
  }

  return NextResponse.json({ partner_programs: partnerIds.size, eligible_students: eligible.size, marked, reverted })
}
