import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface StudentIdentity {
  // id de academic_students. Falta en el caso de suplantación por acta (un
  // documento que solo existe en academic_grades), de ahí que sea opcional.
  id?: string | null
  document_number: string | null
  email: string | null
  name: string
  impersonating: boolean
}

/**
 * Superadmin: figura en la lista explícita app_superadmins.
 *
 * Antes era "no tiene ficha en hr_employees, o la tiene sin rol", y eso concedía
 * el rango por ausencia: un estudiante tampoco tiene ficha. La barrera era pedir
 * isStudentUser() primero en cada llamada, y bastaba que la identificación como
 * estudiante fallara para que el rango se otorgara solo. Falló: cuatro cuentas
 * de estudiantes cuyo correo no coincide con el de su ficha llegaron a
 * superadministrador, y con él a suplantar colaboradores y estudiantes, aplicar
 * descuentos y refacturar (14 de agosto de 2026).
 *
 * Ahora se concede por presencia. Quien no esté en la lista, no lo es, y da
 * igual cómo se le identifique por otro lado.
 */
export async function isSuperadmin(userId: string): Promise<boolean> {
  const sb = admin()
  // Un rol asignado descarta: el superadministrador no lleva rol.
  const { data: emp } = await sb.from('hr_employees').select('role_id').eq('user_id', userId).maybeSingle()
  if (emp?.role_id) return false

  const { data: cuenta } = await sb.auth.admin.getUserById(userId)
  const mail = String(cuenta?.user?.email ?? '').trim().toLowerCase()
  if (!mail) return false

  // Ante cualquier fallo de lectura, NO. El síntoma de un permiso mal puesto es
  // inconfundible —de golpe no hay ningún superadministrador— y se arregla con
  // el grant a service_role de supabase/superadmins.sql, no aflojando esto.
  const { data: lista } = await sb.from('app_superadmins').select('email').ilike('email', mail).maybeSingle()
  return !!lista
}

import { findStudentByLoginEmail } from './student-lookup'
export { findStudentByLoginEmail }

/**
 * True si el usuario logueado es un ESTUDIANTE (por su correo personal O el
 * institucional). Barrera de seguridad para endpoints de gestión: un estudiante
 * NO debe crear/editar/borrar cuotas ni tocar pagos/descuentos.
 * OJO: isSuperadmin() da true para quien no está en hr_employees — y un
 * estudiante tampoco lo está — por eso el gate correcto es rechazar estudiantes.
 */
export async function isStudentUser(user: { email?: string | null } | null): Promise<boolean> {
  return !!(await findStudentByLoginEmail(admin(), user?.email))
}

function fullName(r: { first_name?: string; last_name?: string; second_last_name?: string } | null): string {
  if (!r) return ''
  return [r.first_name, r.last_name, r.second_last_name].filter(Boolean).join(' ')
}

/**
 * Resuelve la identidad de estudiante efectiva para el portal:
 * - Si el correo de login está en academic_students → estudiante real.
 * - Si no lo está y es superadmin con impersonación activa (cookie) → ese estudiante.
 * - En otro caso → null.
 */
export async function getEffectiveStudent(user: { id: string; email?: string } | null): Promise<StudentIdentity | null> {
  if (!user) return null
  const sb = admin()

  // Entra por el personal o por el institucional: los estudiantes de bachelor,
  // master y doctorado tienen @blackwell.pro y 40 de ellos NO tienen personal.
  const data = await findStudentByLoginEmail(sb, user.email, 'id, document_number, email, first_name, last_name, second_last_name')
  if (data) return { id: data.id, document_number: data.document_number, email: data.email, name: fullName(data), impersonating: false }

  const cookieStore = await cookies()
  const doc = cookieStore.get('imp_student')?.value
  if (doc && await isSuperadmin(user.id)) {
    const { data } = await sb.from('academic_students')
      .select('id, document_number, email, first_name, last_name, second_last_name')
      .eq('document_number', doc).maybeSingle()
    if (data) return { id: data.id, document_number: data.document_number, email: data.email, name: fullName(data), impersonating: true }
    const { data: g } = await sb.from('academic_grades')
      .select('document_number, email, student_name').eq('document_number', doc).limit(1).maybeSingle()
    if (g) return { document_number: g.document_number, email: g.email, name: g.student_name, impersonating: true }
  }

  return null
}
