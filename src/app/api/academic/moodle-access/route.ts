import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { moodleConfigured, getUserByEmail, getUserByIdnumber, setUserSuspended } from '@/lib/moodle'
import { planAccess, applyAccess, unsuspendStudent } from '@/lib/moodle-access'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// GET → plan de acceso (vista previa, no aplica nada) + resumen.
export async function GET() {
  const g = await requireStaff(); if ('error' in g) return g.error
  const sb = db()
  const rows = await planAccess(sb)
  return NextResponse.json({
    moodle_configured: moodleConfigured(),
    rows,
    summary: {
      total: rows.length,
      a_suspender: rows.filter(r => r.action === 'suspend').length,
      a_reactivar: rows.filter(r => r.action === 'unsuspend').length,
      con_excepcion: rows.filter(r => r.has_exception).length,
      suspendidos: rows.filter(r => r.currently_suspended).length,
    },
  })
}

// POST:
//  { action: 'apply' }                          → aplica todas las suspensiones/reactivaciones pendientes
//  { action: 'grant', student_id, days, note }  → otorga excepción N días (reactiva ya)
//  { action: 'revoke', id }                     → revoca una excepción (vence ahora)
export async function POST(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  const user = g.user
  const b = await req.json().catch(() => null) as { action?: string; student_id?: string; days?: number; note?: string; id?: string } | null
  if (!b?.action) return NextResponse.json({ error: 'Falta action' }, { status: 400 })
  const sb = db()

  // Prueba INOFENSIVA: reaplica el mismo `suspended` actual de un estudiante real
  // → confirma que core_user_update_users está habilitada, sin cambiar nada.
  if (b.action === 'test') {
    if (!moodleConfigured()) return NextResponse.json({ ok: false, error: 'Moodle no está configurado (MOODLE_URL / MOODLE_WS_TOKEN)' })
    const { data: s } = await sb.from('academic_students')
      .select('id, external_id, email, first_name, last_name').not('email', 'is', null).limit(1).maybeSingle()
    if (!s) return NextResponse.json({ ok: false, error: 'No hay estudiante para probar' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let u: any = null
    if (s.external_id) u = await getUserByIdnumber(String(s.external_id)).catch(() => null)
    if (!u && s.email) u = await getUserByEmail(String(s.email).toLowerCase()).catch(() => null)
    if (!u?.id) return NextResponse.json({ ok: false, error: 'El estudiante de prueba no existe en Moodle — prueba con otro o revisa el token.' })
    const cur = Number(u.suspended) === 1
    try {
      await setUserSuspended(Number(u.id), cur) // no-op: mismo valor
      const nm = [s.first_name, s.last_name].filter(Boolean).join(' ')
      return NextResponse.json({ ok: true, message: `OK — core_user_update_users respondió. Prueba con ${nm} (suspended=${cur}, sin cambios).` })
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e) })
    }
  }

  if (b.action === 'apply') {
    if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no está configurado (MOODLE_URL / MOODLE_WS_TOKEN)' }, { status: 400 })
    const rows = await planAccess(sb)
    const res = await applyAccess(sb, rows)
    return NextResponse.json({ ok: true, ...res })
  }

  if (b.action === 'grant') {
    const days = Number(b.days)
    if (!b.student_id || !(days > 0)) return NextResponse.json({ error: 'Falta estudiante o días' }, { status: 400 })
    const expires = new Date(Date.now() + days * 86400000).toISOString()
    const { error } = await sb.from('moodle_access_exceptions').insert({
      student_id: b.student_id, granted_by: user.email ?? user.id, expires_at: expires, days, note: b.note?.trim() || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Reactiva de inmediato si estaba suspendido (la gracia surte efecto ya)
    if (moodleConfigured()) await unsuspendStudent(sb, b.student_id).catch(() => null)
    return NextResponse.json({ ok: true, expires_at: expires })
  }

  if (b.action === 'revoke') {
    if (!b.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const { error } = await sb.from('moodle_access_exceptions').update({ expires_at: new Date().toISOString() }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}
