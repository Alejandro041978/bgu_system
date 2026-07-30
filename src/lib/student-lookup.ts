/**
 * Búsqueda de estudiante por el correo de inicio de sesión.
 *
 * Vive en su propio módulo, separado de student-identity.ts, porque el
 * middleware lo necesita y student-identity importa `next/headers` (para la
 * cookie de suplantación), que no existe en el runtime del middleware.
 */

/**
 * Busca al estudiante por el correo con el que INICIÓ SESIÓN, que puede ser el
 * personal o el institucional (@blackwell.pro).
 *
 * Buscar solo por `email` era un agujero de privilegios: 40 estudiantes activos
 * tienen únicamente correo institucional, así que su sesión queda a nombre del
 * @blackwell.pro. Con la búsqueda vieja no se les reconocía como estudiantes —
 * y como tampoco están en hr_employees, isSuperadmin() los daba por
 * superadministradores y el middleware les abría el ERP completo.
 */
export async function findStudentByLoginEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, email: string | null | undefined, cols = 'id'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const mail = (email ?? '').trim().toLowerCase()
  // El correo se interpola dentro del filtro `or`, así que se descarta
  // cualquier cosa con caracteres que puedan romperlo.
  if (!mail || !/^[^\s,()'"]+@[^\s,()'"]+$/.test(mail)) return null
  const { data } = await sb.from('academic_students')
    .select(cols).or(`email.eq.${mail},email_alt.eq.${mail}`)
    .eq('disabled', false).limit(1).maybeSingle()
  return data ?? null
}
