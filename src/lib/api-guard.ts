import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ---------------------------------------------------------------------------
// ¿Esta cuenta es del PERSONAL de la institución?
//
// Se responde por presencia y nunca por ausencia: hace falta una ficha en
// hr_employees —por user_id o por correo— o figurar en app_superadmins. Quien
// no esté en ninguna de las dos, no es personal.
//
// Antes se respondía al revés: "no es estudiante, luego es personal". Eso
// convertía cualquier fallo de identificación en un ascenso. Ana María Triviño
// Monje entró el 13 de agosto de 2026 al escritorio de Atención al Cliente y vio
// los 26.144 tickets de la institución, porque su ficha guarda
// "anamariatrivinomX@gmail.com" —con una equis de más— y su cuenta real es
// "anamariatrivinom@gmail.com". Un correo mal escrito la ascendió.
//
// Y no era el único camino: findStudentByLoginEmail exige disabled=false, así
// que deshabilitar a un estudiante también lo habría promovido, y quien solo
// figura en academic_grades nunca fue reconocido.
//
// Medido el 14 de agosto de 2026 sobre las 635 cuentas: 34 pasaban el guard
// viejo, 28 son personal de verdad y 6 no. Cuatro de esas 6 habían entrado, las
// cuatro estudiantes con el correo distinto al de su ficha. Ninguna ficha de
// colaborador con cuenta pierde el acceso con esta regla.
//
// La ficha MANDA sobre ser estudiante: un mismo correo puede estar en
// hr_employees y en academic_students —personal que además estudia aquí— y en
// ese caso la persona trabaja aquí.
// ---------------------------------------------------------------------------
export async function esPersonal(user: { id: string; email?: string | null }): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin() as any

  const { data: porUser } = await sb.from('hr_employees').select('id').eq('user_id', user.id).maybeSingle()
  if (porUser) return true

  // El correo se interpola en el filtro `or`: se descarta cualquier cosa que
  // pueda romperlo, igual que en findStudentByLoginEmail.
  const mail = (user.email ?? '').trim().toLowerCase()
  if (mail && /^[^\s,()'"]+@[^\s,()'"]+$/.test(mail)) {
    const { data: porCorreo } = await sb.from('hr_employees')
      .select('id').or(`email.eq.${mail},zoho_agent_email.eq.${mail}`).limit(1).maybeSingle()
    if (porCorreo) return true

    // Un fallo de lectura NO puede conceder acceso: sin respuesta clara, no es
    // personal. (Así se cerró el mismo agujero en app_superadmins: la tabla
    // creada sin permiso al service_role devolvía error y el código que
    // interpretaba el error como "pasa" habría abierto el ERP entero.)
    const { data: sa } = await sb.from('app_superadmins').select('email').ilike('email', mail).maybeSingle()
    if (sa) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Guard de las rutas de gestión: exige sesión Y ser personal.
// ---------------------------------------------------------------------------
export async function guardStaff(): Promise<NextResponse | null> {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await esPersonal(user)) return null
  return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
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

  // Cualquier otro fallo al leer la lista niega. Es deliberado: ante la duda,
  // que no se pueda tocar un acta. El caso real fue un grant que faltaba —la
  // tabla existía y la lectura devolvía "permission denied"—, y el síntoma es
  // inconfundible: de golpe no hay ningún superadministrador. Se arregla con el
  // grant a service_role de supabase/superadmins.sql, no aflojando esto.
  if (error) return false

  return !!lista
}
