import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveStudent } from '@/lib/student-identity'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Los datos personales que el estudiante ve de sí mismo. SOLO LECTURA.
//
// Existe por un caso concreto: a un alumno se le llenó el buzón, dejó de
// recibir el enlace de acceso y estuvo sin poder entrar hasta que lo reportó
// por WhatsApp y Servicios le corrigió el correo a mano. Nunca pudo ver qué
// correo tenía la institución anotado, así que no había forma de que lo notara
// antes de quedarse fuera.
//
// No hay PATCH, y es deliberado. El correo no es un dato más: es la llave de la
// cuenta —se entra por enlace mágico a ese buzón—, así que un campo editable
// convierte cualquier sesión abierta en una toma permanente de la cuenta. El
// día que se abra el autoservicio será con el patrón de /form/recoverymail
// —código al canal ya registrado, tope de intentos— y no con un formulario.
//
// Devuelve lo que el estudiante puede reconocer como suyo y comprobar de un
// vistazo. Nada de banderas internas (situation_source, moodle_user_id,
// external_id): no las entendería y no le sirven para detectar un error.
// ---------------------------------------------------------------------------
// El tipo de documento llegó de SystemActiva con un "=" delante y en inglés
// —"=NationalIdCard", "=Passport"—, así en las 1.996 fichas. Se traduce al
// LEER y no se migra: el sincronizador volvería a escribirlo como está, y esto
// es presentación, no dato. Lo que no esté en la lista se muestra separando las
// mayúsculas, que es legible aunque no sea bonito.
const DOCUMENTO: Record<string, string> = {
  NationalIdCard: 'Documento de identidad',
  Passport: 'Pasaporte',
  DiplomaticIdCard: 'Carné diplomático',
  OtherNonResidentDocument: 'Documento de no residente',
  AlienRegistrationNumber: 'Número de registro de extranjero',
  VotingCard: 'Credencial de elector',
  DriversLicense: 'Licencia de conducir',
  ResidencyPermit: 'Permiso de residencia',
  DNI: 'DNI',
}
function tipoDocumento(v: string | null): string | null {
  if (!v) return null
  const limpio = String(v).replace(/^=/, '').trim()
  return DOCUMENTO[limpio] ?? limpio.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const sb = db()
  // Por id cuando lo hay; por documento en la suplantación por acta, donde el
  // estudiante existe en las notas pero no tiene ficha.
  let ficha = null
  if (ident.id) {
    const { data } = await sb.from('academic_students').select('*').eq('id', ident.id).maybeSingle()
    ficha = data
  } else if (ident.document_number) {
    const { data } = await sb.from('academic_students').select('*').eq('document_number', ident.document_number).maybeSingle()
    ficha = data
  }
  if (!ficha) {
    return NextResponse.json({ error: 'Todavía no encontramos tu ficha. Escríbenos a Servicios al Estudiante.' }, { status: 404 })
  }

  const { data: matriculas } = await sb.from('academic_student_enrollments')
    .select('enrollment_date, status, academic_programs(name)').eq('student_id', ficha.id)

  return NextResponse.json({
    nombre: [ficha.first_name, ficha.last_name, ficha.second_last_name].filter(Boolean).join(' ').replace(/\s+/g, ' '),
    documento: ficha.document_number,
    tipo_documento: tipoDocumento(ficha.document_type),
    fecha_nacimiento: ficha.date_of_birth,
    pais_nacimiento: ficha.birth_country,
    pais: ficha.country,
    ciudad: ficha.city,
    telefono: ficha.phone_number,
    correo_personal: ficha.email,
    correo_institucional: ficha.email_alt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    programas: ((matriculas ?? []) as any[]).map(m => ({
      nombre: m.academic_programs?.name ?? null,
      desde: m.enrollment_date,
      estado: m.status,
    })),
  })
}
