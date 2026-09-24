import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { moodleConfigured, moodleCall } from '@/lib/moodle'
import { planAccess, applyAccess } from '@/lib/moodle-access'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Reconciliación diaria del acceso a Moodle: suspende a los nuevos morosos
// (vencido > 0 sin excepción vigente) y reactiva a los que pagaron o cuya
// excepción venció y volvieron a estar al día. vercel.json.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!moodleConfigured()) return NextResponse.json({ ok: true, skipped: 'moodle_no_configurado' })
  const sb = db()

  // ?diag=doc1,doc2 → SOLO diagnóstico (no reconcilia): qué cuentas de Moodle
  // corresponden a esos estudiantes, por id anotado y por sus correos. Para
  // resolver "está suspendida en el campus y el ERP dice que no" (24/09/2026).
  const diag = req.nextUrl.searchParams.get('diag')
  if (diag) {
    const docs = diag.split(',').map(x => x.trim()).filter(Boolean)
    const { data: studs } = await sb.from('academic_students')
      .select('id, first_name, last_name, document_number, email, email_alt, external_id, moodle_user_id, moodle_suspended').in('document_number', docs)
    const out = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const st of (studs ?? []) as any[]) {
      const cuentas: Record<string, unknown>[] = []
      const ver = async (field: string, value: string | null) => {
        if (!value) return
        try {
          const r = await moodleCall('core_user_get_users_by_field', { field, values: [value] })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const u of (r ?? []) as any[]) cuentas.push({ via: `${field}=${value}`, id: u.id, email: u.email, idnumber: u.idnumber, suspended: u.suspended, lastaccess: u.lastaccess ? new Date(Number(u.lastaccess) * 1000).toISOString().slice(0, 10) : 'nunca' })
        } catch (e) { cuentas.push({ via: `${field}=${value}`, error: e instanceof Error ? e.message.slice(0, 120) : 'error' }) }
      }
      await ver('id', st.moodle_user_id ? String(st.moodle_user_id) : null)
      await ver('email', st.email); await ver('email', st.email_alt)
      await ver('idnumber', st.external_id); await ver('idnumber', st.id)
      out.push({ estudiante: [st.first_name, st.last_name].filter(Boolean).join(' '), documento: st.document_number, erp: { moodle_user_id: st.moodle_user_id, moodle_suspended: st.moodle_suspended }, cuentas })
    }
    return NextResponse.json({ diag: out })
  }

  const rows = await planAccess(sb)
  const res = await applyAccess(sb, rows)

  // Deja constancia de la corrida. Hasta ahora no quedaba rastro de cuándo se
  // había reconciliado el acceso por última vez, así que nadie podía saber si
  // lo que veía en pantalla era de hoy o de hace tres semanas — que es
  // exactamente el punto ciego que hizo que 59 cuentas quedaran abiertas sin
  // que nadie lo notara.
  try {
    await sb.from('system_job_runs').insert({
      job: 'moodle-access',
      ok: res.errors.length === 0,
      summary: { evaluados: rows.length, suspendidas: res.suspended, reactivadas: res.unsuspended, errores: res.errors.length },
      errors: res.errors.slice(0, 50),
    })
  } catch { /* el registro no puede tumbar la reconciliación */ }

  return NextResponse.json({ ok: true, evaluados: rows.length, ...res })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
