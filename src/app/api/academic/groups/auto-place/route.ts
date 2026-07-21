import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { provisionStudent } from '@/lib/moodle-provision'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(sb: any, table: string, select: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return rows
}

// Colocación automática: los programas con UN SOLO carrusel de entrada no
// esperan decisión humana — toda matrícula activa sin carrusel se coloca
// directo en esa entrada (la bandeja queda para programas con varias
// entradas). Idempotente: los ya colocados se saltan; si el barrido muere a
// medias, re-ejecutar continúa donde quedó.
// POST { dry_run?: boolean } → dry_run devuelve el plan sin tocar nada.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const dryRun = !!body?.dry_run
  const sb = db()

  // Carruseles de entrada únicos por programa (entrada = ningún otro la apunta)
  const groups = await readAll(sb, 'academic_groups', 'id, program_id, next_group_id, abbreviation, name')
  const byProgram = new Map<string, typeof groups>()
  for (const g of groups) {
    if (!g.program_id) continue
    if (!byProgram.has(g.program_id)) byProgram.set(g.program_id, [])
    byProgram.get(g.program_id)!.push(g)
  }
  const entryOf = new Map<string, { id: string; label: string }>()   // programa → entrada única
  for (const [pid, gs] of byProgram) {
    const pointed = new Set(gs.map(g => g.next_group_id).filter(Boolean))
    const entries = gs.filter(g => !pointed.has(g.id))
    if (entries.length === 1) {
      entryOf.set(pid, { id: entries[0].id, label: [entries[0].abbreviation, entries[0].name].filter(Boolean).join(' · ') || entries[0].id })
    }
  }
  if (!entryOf.size) return NextResponse.json({ ok: true, programas_carrusel_unico: 0, pendientes: 0, colocados: 0, detalle: [] })

  // Matrículas de esos programas + membresías existentes + situación
  // (las 'pendiente_pago' NO se colocan: el gate de pago las activa después)
  const enr = (await readAll(sb, 'academic_student_enrollments', 'student_id, program_id, status'))
    .filter(e => e.student_id && entryOf.has(e.program_id) && e.status !== 'pendiente_pago')
  const groupIds = new Set(groups.map(g => g.id))
  const placed = new Set(
    (await readAll(sb, 'academic_group_students', 'student_id, group_id'))
      .filter(m => groupIds.has(m.group_id))
      .map(m => `${m.student_id}|${groups.find(g => g.id === m.group_id)?.program_id}`)
  )
  const students = await readAll(sb, 'academic_students', 'id, situation, first_name, last_name, second_last_name')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stuOf = new Map<string, any>(students.map(s => [s.id, s]))

  // Pendientes: matrícula activa (situation activo o sin marcar) y sin
  // membresía en NINGÚN carrusel del programa (pudo haber avanzado ya).
  const seen = new Set<string>()
  const pending: { student_id: string; program_id: string }[] = []
  for (const e of enr) {
    const key = `${e.student_id}|${e.program_id}`
    if (seen.has(key) || placed.has(key)) continue
    seen.add(key)
    const s = stuOf.get(e.student_id)
    if (!s) continue
    if (s.situation && s.situation !== 'activo') continue
    pending.push(e)
  }

  const porGrupo = new Map<string, { label: string; estudiantes: string[] }>()
  for (const p of pending) {
    const entry = entryOf.get(p.program_id)!
    if (!porGrupo.has(entry.id)) porGrupo.set(entry.id, { label: entry.label, estudiantes: [] })
    const s = stuOf.get(p.student_id)
    porGrupo.get(entry.id)!.estudiantes.push([s?.first_name, s?.last_name, s?.second_last_name].filter(Boolean).join(' ') || p.student_id)
  }
  const detalle = [...porGrupo.entries()]
    .map(([group_id, v]) => ({ group_id, carrusel: v.label, n: v.estudiantes.length, estudiantes: v.estudiantes.slice(0, 10) }))
    .sort((a, b) => b.n - a.n)

  if (dryRun) {
    return NextResponse.json({ ok: true, dry_run: true, programas_carrusel_unico: entryOf.size, pendientes: pending.length, colocados: 0, detalle })
  }

  // Ejecutar: membresía primero (la verdad del ERP), Moodle después
  // (best-effort — cuentas se crean si no existen; sin aulas mapeadas solo
  // deja la cuenta lista y el sync del grupo completa después).
  let colocados = 0, moodle_enrols = 0, cuentas_creadas = 0
  const errors: string[] = []
  for (const p of pending) {
    const entry = entryOf.get(p.program_id)!
    const { error } = await sb.from('academic_group_students')
      .upsert({ group_id: entry.id, student_id: p.student_id, status: 'activo' }, { onConflict: 'group_id,student_id' })
    if (error) { errors.push(`${p.student_id}: ${error.message}`); continue }
    colocados++
    const r = await provisionStudent(entry.id, p.student_id, 'enrol')
    moodle_enrols += r.enrol_ops
    cuentas_creadas += r.accounts_created
    errors.push(...r.errors)
  }

  return NextResponse.json({
    ok: errors.length === 0,
    programas_carrusel_unico: entryOf.size,
    pendientes: pending.length,
    colocados, moodle_enrols, cuentas_creadas,
    detalle,
    errors: errors.slice(0, 10),
  })
}
