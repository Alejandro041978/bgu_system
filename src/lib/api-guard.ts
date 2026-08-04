import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'

// ---------------------------------------------------------------------------
// Guard de las rutas de gestión.
//
// Dos comprobaciones, y la segunda es la que casi siempre falta: además de
// exigir sesión, hay que exigir que NO sea un estudiante. Los alumnos tienen
// sesión de Supabase, así que "hay usuario" no distingue a quien administra de
// quien es administrado — y estas rutas reciben un student_id o un
// employee_id por parámetro, de modo que sin este rechazo bastaba cambiar un
// número en la URL para leer o escribir el expediente de otra persona.
//
// No basta con mirar el rol: isSuperadmin() devuelve true para estudiantes.
//
// Uso:
//   const no = await guardStaff()
//   if (no) return no
// ---------------------------------------------------------------------------
export async function guardStaff(): Promise<NextResponse | null> {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  return null
}
