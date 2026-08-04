import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'

// ---------------------------------------------------------------------------
// Guard de Planeamiento.
//
// Las rutas de este módulo leen y escriben con service_role, que se salta RLS.
// Sin una comprobación aquí, la única barrera es "tener sesión" — y los
// estudiantes tienen sesión de Supabase. Eso dejaba el plan estratégico, las
// metas y los avances legibles y editables por cualquier alumno con cuenta.
//
// No basta con mirar el rol: isSuperadmin() devuelve true para estudiantes.
// Hay que preguntar explícitamente si el usuario ES un estudiante.
//
// Uso:
//   const no = await guardPlanning()
//   if (no) return no
// ---------------------------------------------------------------------------
export async function guardPlanning(): Promise<NextResponse | null> {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  return null
}
