import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { activateEnrollment, initialsPaid } from '@/lib/enrollment-activation'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST { enrollment_id, force? } → activa la matrícula (acta con malla
// completa + correo + carrusel/Moodle). Sin force exige los conceptos
// iniciales pagados; con force queda auditado quién decidió la excepción.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null) as { enrollment_id?: string; force?: boolean } | null
  if (!b?.enrollment_id) return NextResponse.json({ error: 'Falta enrollment_id' }, { status: 400 })

  const sb = db()
  const { paid, pendientes } = await initialsPaid(sb, b.enrollment_id)
  if (!paid && !b.force) {
    return NextResponse.json({
      error: `Los conceptos iniciales aún no están pagados (${pendientes} pendiente${pendientes === 1 ? '' : 's'}). Usa "force" solo con autorización.`,
      pendientes,
    }, { status: 409 })
  }

  const who = `${user.email ?? user.id}${!paid ? ' (force)' : ''}`
  const result = await activateEnrollment(b.enrollment_id, who)
  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 })
}
