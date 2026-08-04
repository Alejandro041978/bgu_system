import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ---------------------------------------------------------------------------
// Guard de las rutas de gestión.
//
// Exige sesión y además que quien la tiene no sea un estudiante: los alumnos
// tienen sesión de Supabase, así que "hay usuario" no distingue a quien
// administra de quien es administrado.
//
// La ficha de colaborador MANDA. Un correo puede estar a la vez en
// hr_employees y en academic_students —personal que además estudia aquí, y
// cualquiera que use su correo institucional para las dos cosas— y en ese caso
// la persona trabaja aquí. Preguntar solo "¿es estudiante?" dejaba a esa gente
// fuera de su propio puesto de trabajo.
// ---------------------------------------------------------------------------
export async function guardStaff(): Promise<NextResponse | null> {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: emp } = await (admin() as any)
    .from('hr_employees').select('id').eq('user_id', user.id).maybeSingle()
  if (emp) return null                       // es colaborador: pasa

  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  return null
}
