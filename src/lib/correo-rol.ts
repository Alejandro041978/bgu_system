// ---------------------------------------------------------------------------
// Un correo pertenece a un solo rol: o es de estudiante, o es de colaborador.
//
// La garantía dura está en el trigger de la base (correo_unico_rol.sql), que
// cubre también las importaciones y N8N. Esto es la versión amable: revisa
// antes de guardar para poder decir de quién es el correo, en vez de dejar que
// salte una excepción de Postgres a mitad del alta.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

/** Devuelve el motivo si el correo ya es de otro rol, o null si está libre. */
export async function correoDeOtroRol(
  sb: SB, correo: string | null | undefined, rol: 'estudiante' | 'colaborador',
): Promise<string | null> {
  const c = String(correo ?? '').trim().toLowerCase()
  if (!c) return null

  if (rol === 'colaborador') {
    const { data } = await sb.from('academic_students')
      .select('first_name, last_name').or(`email.ilike.${c},email_alt.ilike.${c}`).limit(1).maybeSingle()
    if (data) {
      return `Ese correo ya es de un estudiante (${[data.first_name, data.last_name].filter(Boolean).join(' ')}). `
        + 'Un colaborador debe usar su correo de trabajo.'
    }
    return null
  }

  const { data } = await sb.from('hr_employees')
    .select('full_name').ilike('email', c).limit(1).maybeSingle()
  if (data) {
    return `Ese correo ya es del colaborador ${data.full_name}. `
      + 'El estudiante debe usar su correo @blackwell.pro o su correo personal.'
  }
  return null
}
