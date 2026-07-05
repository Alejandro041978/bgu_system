import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperadmin } from '@/lib/student-identity'

// POST { document } → activa "ver como estudiante". { document: '' } → sale de la vista.
// Solo superadmin.
export async function POST(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await isSuperadmin(user.id))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { document } = await req.json() as { document?: string }
  const res = NextResponse.json({ ok: true })
  if (document) {
    res.cookies.set('imp_student', document, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
  } else {
    res.cookies.set('imp_student', '', { httpOnly: true, path: '/', maxAge: 0 })
  }
  return res
}
