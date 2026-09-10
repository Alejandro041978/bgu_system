import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { esSuperadmin } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ---------------------------------------------------------------------------
// Los dos ámbitos donde editar una nota a mano es el procedimiento normal y no
// una excepción.
//
// Salieron de mirar las 53 ediciones manuales que se hicieron sin permiso entre
// julio y agosto de 2026. Ninguna era un capricho: todas eran notas que el ERP
// no podía traer solo, porque nacían donde no llega.
//
//   · campus_externo — el programa se dicta en otra institución y la
//     calificación vive en su LMS (Coursera, TEP, Griky, el de IISHS). Son los
//     15 programas con partner_campus.
//
//   · capstone — la nota sale de la defensa del trabajo final, no del aula. El
//     aula acompaña y da acceso; evaluar no es su oficio.
//
// Cada ámbito es una página propia con su propio permiso, para que Dirección
// pueda darle a una persona la potestad sobre ESTAS notas sin darle la de todas.
// Fuera de estos dos, editar sigue siendo del superadministrador.
// ---------------------------------------------------------------------------
export type Ambito = 'campus_externo' | 'capstone'

export const PAGE_KEY: Record<Ambito, string> = {
  campus_externo: 'academic_external_campus',
  capstone: 'academic_capstone',
}

export const TITULO: Record<Ambito, string> = {
  campus_externo: 'Notas de campus externo',
  capstone: 'Notas de Capstone',
}

/** Los course_id que caen dentro del ámbito. Es la definición, y se lee de la
 *  base cada vez: la marca la mueve Dirección, no el código. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cursosDelAmbito(sb: any, ambito: Ambito): Promise<Set<string>> {
  if (ambito === 'capstone') {
    const { data } = await sb.from('academic_courses').select('id').eq('is_capstone', true)
    return new Set((data ?? []).map((c: { id: string }) => String(c.id)))
  }
  // Campus socio se declara en DOS niveles y el alcance es la unión:
  //
  //   · el programa entero se dicta fuera  → academic_programs.partner_campus
  //   · una asignatura suelta se cursa fuera dentro de un programa normal
  //     → academic_courses.partner_campus
  //
  // El segundo nivel salió de mirar dónde caían las notas escritas a mano: 19
  // asignaturas en seis programas que no son socios —Coursera, Griky, LMS TEP—
  // y ninguna con aula en Moodle, porque no se cursan aquí.
  const out = new Set<string>()

  const { data: progs } = await sb.from('academic_programs').select('id').eq('partner_campus', true)
  const ids = (progs ?? []).map((p: { id: string }) => String(p.id))
  if (ids.length) {
    const { data: cursos } = await sb.from('academic_courses').select('id').in('program_id', ids)
    for (const c of (cursos ?? []) as { id: string }[]) out.add(String(c.id))
  }

  const { data: sueltas } = await sb.from('academic_courses').select('id').eq('partner_campus', true)
  for (const c of (sueltas ?? []) as { id: string }[]) out.add(String(c.id))

  return out
}

// Tercer nivel del campus externo (09/09/2026): pares estudiante+asignatura.
// Un estudiante concreto cursa fuera una asignatura que SÍ tiene aula de
// Moodle para sus compañeros. Devuelve course_id → set de student_ids.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function marcadosExternos(sb: any): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  const { data } = await sb.from('external_campus_students').select('student_id, course_id')
  for (const r of (data ?? []) as { student_id: string; course_id: string }[]) {
    const k = String(r.course_id)
    if (!out.has(k)) out.set(k, new Set())
    out.get(k)!.add(String(r.student_id))
  }
  return out
}

// Los estudiantes marcados como campus externo en UNA asignatura (para que el
// importador y el aprovisionador consulten solo lo suyo).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function externosDeCurso(sb: any, courseId: string): Promise<Set<string>> {
  const { data } = await sb.from('external_campus_students')
    .select('student_id').eq('course_id', courseId)
  return new Set((data ?? []).map((r: { student_id: string }) => String(r.student_id)))
}

/**
 * ¿Esta nota concreta cae dentro del ámbito?
 *
 * Se comprueba EN EL SERVIDOR releyendo la fila, y no se confía en lo que venga
 * del navegador. Si no se hiciera, el permiso de "notas de capstone" sería en
 * realidad el permiso de editar cualquier nota: basta con mandar otro
 * external_id. La pantalla filtra por comodidad; esto es lo que manda.
 *
 * En campus_externo el ámbito es la asignatura O el par estudiante+asignatura
 * marcado individualmente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function notaEnAmbito(sb: any, externalId: string, ambito: Ambito): Promise<boolean> {
  const { data: nota } = await sb.from('academic_grades')
    .select('course_id, student_id').eq('external_id', externalId).maybeSingle()
  const cursoId = nota?.course_id ? String(nota.course_id) : null
  // Una nota sin asignatura enlazada no pertenece a ningún ámbito. Es
  // deliberado: sin saber qué asignatura es, no hay forma de afirmar que le
  // toca a este colaborador, y afirmarlo por descarte es como se archivaron mal
  // cincuenta notas en las aulas reutilizadas.
  if (!cursoId) return false
  if ((await cursosDelAmbito(sb, ambito)).has(cursoId)) return true
  if (ambito === 'campus_externo' && nota?.student_id) {
    return (await externosDeCurso(sb, cursoId)).has(String(nota.student_id))
  }
  return false
}

/**
 * Quién puede editar en este ámbito: el superadministrador, o quien tenga
 * can_edit sobre la página del ámbito. A diferencia de las notas en general,
 * esto SÍ se configura por rol — es justamente el punto de separarlas.
 */
export async function guardAmbito(ambito: Ambito): Promise<NextResponse | null> {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const negar = NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (await esSuperadmin(user)) return null
  // Un estudiante no tiene ficha de colaborador, así que sin este corte llegaría
  // a la consulta de rol con las manos vacías y saldría por el mismo sitio que
  // un colaborador sin permiso. Se corta antes, y explícito.
  if (await isStudentUser(user)) return negar

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin() as any
  const { data: emp } = await sb.from('hr_employees')
    .select('role_id').eq('user_id', user.id).maybeSingle()
  if (!emp?.role_id) return negar

  const { data: perm } = await sb.from('role_permissions')
    .select('can_edit').eq('role_id', emp.role_id).eq('page_key', PAGE_KEY[ambito]).maybeSingle()
  return perm?.can_edit ? null : negar
}
