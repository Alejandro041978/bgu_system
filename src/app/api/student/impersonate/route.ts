import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperadmin, isStudentUser } from '@/lib/student-identity'

// POST { document } → activa "ver como estudiante". { document: '' } → sale de la vista.
//
// Solo superadmin, y superadmin de verdad: isSuperadmin() devuelve true para
// cualquiera que no esté en hr_employees, y un estudiante tampoco lo está. Sin
// el rechazo explícito, un alumno con sesión podía activar esta cookie con el
// documento de otro y entrar a su portal — sus notas, su estado de cuenta y
// sus trámites. El propio archivo de identidad advierte de esta trampa.
export async function POST(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || await isStudentUser(user) || !(await isSuperadmin(user.id))) {
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
