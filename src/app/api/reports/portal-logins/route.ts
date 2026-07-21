import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Reporte de accesos al Portal del Estudiante.
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&q= →
//   por_dia: ingresos y estudiantes únicos por día del rango (def. últimos 30)
//   resumen 7/30 días, conectados ahora (latido < 3 min) y últimos ingresos.
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
  const now = new Date()
  const defFrom = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10)
  const from = req.nextUrl.searchParams.get('from') || defFrom
  const to = req.nextUrl.searchParams.get('to') || now.toISOString().slice(0, 10)
  const fromIso = `${from}T00:00:00Z`
  const toIso = `${to}T23:59:59Z`
  const sb = db()

  // Ingresos del rango (paginado)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('student_portal_logins')
      .select('id, student_id, email, ip, logged_at')
      .gte('logged_at', fromIso).lte('logged_at', toIso)
      .order('logged_at', { ascending: false }).range(off, off + 999)
    if (error) return NextResponse.json({ error: 'Falta correr supabase/student_portal_logins.sql: ' + error.message }, { status: 400 })
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000 || rows.length >= 20000) break
  }

  // Resúmenes 7/30 días (independientes del rango elegido)
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString()
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString()
  const { data: last30 } = await sb.from('student_portal_logins')
    .select('email, logged_at').gte('logged_at', d30).limit(20000)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l30 = (last30 ?? []) as any[]
  const resumen = {
    ingresos_7d: l30.filter(r => r.logged_at >= d7).length,
    ingresos_30d: l30.length,
    estudiantes_7d: new Set(l30.filter(r => r.logged_at >= d7).map(r => r.email)).size,
    estudiantes_30d: new Set(l30.map(r => r.email)).size,
  }

  // Serie por día del rango (rellena los días sin ingresos con 0)
  const porDiaMap = new Map<string, { ingresos: number; emails: Set<string> }>()
  for (let d = new Date(fromIso); d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 86400000)) {
    porDiaMap.set(d.toISOString().slice(0, 10), { ingresos: 0, emails: new Set() })
  }
  for (const r of rows) {
    const day = String(r.logged_at).slice(0, 10)
    const cell = porDiaMap.get(day)
    if (cell) { cell.ingresos++; cell.emails.add(r.email) }
  }
  const por_dia = [...porDiaMap.entries()]
    .map(([dia, v]) => ({ dia, ingresos: v.ingresos, estudiantes: v.emails.size }))
    .sort((a, b) => b.dia.localeCompare(a.dia))

  // Conectados ahora: latido en los últimos 3 minutos
  const hace3min = new Date(now.getTime() - 3 * 60000).toISOString()
  const { data: pres } = await sb.from('student_portal_presence')
    .select('student_id, email, last_seen').gte('last_seen', hace3min).order('last_seen', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conectadosRaw = (pres ?? []) as any[]

  // Nombres de estudiantes (de los ingresos del rango y de los conectados)
  const studentIds = [...new Set([
    ...rows.map(r => r.student_id), ...conectadosRaw.map(c => c.student_id),
  ].filter(Boolean))] as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const students = new Map<string, any>()
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number')
      .in('id', studentIds.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) students.set(s.id, s)
  }
  const nameOf = (sid: string | null) => {
    const s = sid ? students.get(sid) : null
    return s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : null
  }
  const docOf = (sid: string | null) => {
    const s = sid ? students.get(sid) : null
    return s ? String(s.document_number ?? '') : null
  }

  const conectados = conectadosRaw.map(c => ({
    student_id: c.student_id, email: c.email, last_seen: c.last_seen,
    name: nameOf(c.student_id), document: docOf(c.student_id),
  }))

  const ingresos = rows.map(r => ({
    id: r.id, logged_at: r.logged_at, email: r.email, ip: r.ip,
    name: nameOf(r.student_id), document: docOf(r.student_id),
  })).filter(r => !q
    || (r.name ?? '').toLowerCase().includes(q)
    || r.email.includes(q)
    || (r.document ?? '').includes(q)
  ).slice(0, 300)

  return NextResponse.json({ from, to, resumen, por_dia, conectados, rows: ingresos })
}
