import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Reporte de accesos al Portal del Estudiante.
// GET ?q=&limit= → últimos ingresos (con estudiante), y resumen: ingresos y
// estudiantes únicos de 7/30 días.
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 200), 1000)
  const sb = db()

  const { data: logs, error } = await sb.from('student_portal_logins')
    .select('id, student_id, email, ip, logged_at')
    .order('logged_at', { ascending: false }).limit(1000)
  if (error) return NextResponse.json({ error: 'Falta correr supabase/student_portal_logins.sql: ' + error.message }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (logs ?? []) as any[]
  const studentIds = [...new Set(rows.map(r => r.student_id).filter(Boolean))] as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const students = new Map<string, any>()
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number')
      .in('id', studentIds.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) students.set(s.id, s)
  }

  const now = Date.now()
  const d7 = new Date(now - 7 * 86400000).toISOString()
  const d30 = new Date(now - 30 * 86400000).toISOString()
  const resumen = {
    ingresos_7d: rows.filter(r => r.logged_at >= d7).length,
    ingresos_30d: rows.filter(r => r.logged_at >= d30).length,
    estudiantes_7d: new Set(rows.filter(r => r.logged_at >= d7).map(r => r.email)).size,
    estudiantes_30d: new Set(rows.filter(r => r.logged_at >= d30).map(r => r.email)).size,
  }

  const enriched = rows.map(r => {
    const s = students.get(r.student_id)
    return {
      id: r.id,
      logged_at: r.logged_at,
      email: r.email,
      ip: r.ip,
      name: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : null,
      document: s ? String(s.document_number ?? '') : null,
    }
  }).filter(r => !q
    || (r.name ?? '').toLowerCase().includes(q)
    || r.email.includes(q)
    || (r.document ?? '').includes(q)
  ).slice(0, limit)

  return NextResponse.json({ resumen, rows: enriched })
}
