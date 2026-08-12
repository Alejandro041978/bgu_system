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

// ---------------------------------------------------------------------------
// Guard de las rutas que ESCRIBEN una calificación a mano. Solo superadmin.
//
// Existe porque guardStaff() no alcanzaba: solo pregunta "¿hay sesión y no es
// un estudiante?", así que cualquier colaborador con acceso al ERP podía
// cambiar una nota final. Los roles decían ver=true, editar=false, y no servía
// de nada: el permiso por página se evalúa en el middleware, que hasta hoy corre
// en modo auditoría —registra y deja pasar—. Entre el 24 de julio y el 12 de
// agosto de 2026 se hicieron así 53 ediciones manuales, ninguna por alguien con
// el permiso de editar.
//
// Editar una nota no se configura por rol a propósito. Es la decisión de
// Dirección: una calificación es el acta de la institución, y quien la corrige
// responde por ella. Si algún día debe delegarse, que sea una decisión
// explícita y no el efecto lateral de un permiso mal marcado.
//
// El orden importa. isSuperadmin() = "no tiene ficha de colaborador o no tiene
// rol", y un estudiante tampoco tiene ficha: preguntarlo primero convertía a
// cualquier alumno en superadmin. Por eso se rechaza al estudiante antes.
//
// La suplantación ("ver como colaborador") queda fuera por construcción:
// createAuthClient() ya devuelve al colaborador suplantado, que sí tiene rol.
// ---------------------------------------------------------------------------
export async function guardSuperadmin(): Promise<NextResponse | null> {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (await esSuperadmin(user)) return null

  return NextResponse.json({
    error: 'Solo un superadministrador puede modificar una calificación.',
  }, { status: 403 })
}

// ---------------------------------------------------------------------------
// ¿Es superadministrador? Dos condiciones, y hacen falta las dos.
//
// No basta con no tener rol. "Superadmin = quien no está fichado" es una
// definición por ausencia, y las ausencias se acumulan solas: contrastada con
// las 625 cuentas del ERP la cumplían nueve —las tres de Dirección y seis
// correos personales que no cruzan ni con una ficha de colaborador ni con una
// de estudiante, cuentas viejas o alumnos cuyo correo de acceso no es el de su
// expediente—. Por eso además hay que estar en app_superadmins, que es una
// decisión escrita en vez de un hueco en los datos.
//
// Estar en la lista pesa MÁS que parecer estudiante, y por eso se pregunta
// después del rol y no antes. Dos de las tres cuentas de Dirección cruzan con
// una ficha de estudiante —personal que además estudia aquí, o correos
// institucionales reutilizados—, así que rechazar por "es alumno" antes de
// mirar la lista las habría dejado sin poder corregir un acta. Un estudiante no
// entra a la lista solo: alguien tiene que escribirlo ahí.
// ---------------------------------------------------------------------------
export async function esSuperadmin(user: { id: string; email?: string | null }): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin() as any
  const { data: emp } = await sb
    .from('hr_employees').select('role_id').eq('user_id', user.id).maybeSingle()
  if (emp?.role_id) return false

  const { data: lista, error } = await sb
    .from('app_superadmins').select('email').ilike('email', user.email ?? '').maybeSingle()

  // Si la tabla todavía no existe (el deploy llegó antes que el SQL) se mantiene
  // la regla anterior —incluido su rechazo a los estudiantes, que sin lista es
  // lo único que los separa de un superadmin—. Nunca deja pasar a más gente de
  // la que ya pasaba, y evita quedarse sin nadie capaz de corregir una nota.
  if (error?.code === '42P01') return !(await isStudentUser(user))

  return !!lista
}
