import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { moodleCall, moodleConfigured, moodleUserState, getUserByIdnumber, getUserByEmail } from '@/lib/moodle'
import { loadGroupCourses, coleccionDe } from '@/lib/moodle-provision'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Estado EN VIVO de un estudiante en el campus virtual, aula por aula.
//
// Existe porque el ERP no mostraba en ninguna pantalla en qué aulas está
// matriculado alguien ni en cuáles quedó SUSPENDIDO (la baja por avance de
// carrusel suspende desde fa03f4a; los 302 restaurados del 02-09 quedaron
// suspendidos a propósito) — había que entrar a Moodle aula por aula.
//
// Tres fuentes que se contrastan:
//  - lo ACTIVO según Moodle (core_enrol_get_users_courses con el userid),
//  - lo ESPERADO según el ERP (las aulas de sus carruseles activos, resueltas
//    por su colección — la misma lógica del aprovisionamiento),
//  - lo HISTÓRICO (aulas de sus actas + suspensiones detectables: el reporte
//    por usuario responde aunque la matrícula esté suspendida).
// La anomalía es el contraste: activo donde no le toca, o sin acceso donde sí.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Personal con sesión, o CRON_SECRET para diagnósticos por script
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    const auth = await createAuthClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no configurado' }, { status: 503 })

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Falta student_id' }, { status: 400 })

  const sb = db()
  const { data: stu } = await sb.from('academic_students')
    .select('id, external_id, email, email_alt, moodle_user_id').eq('id', studentId).maybeSingle()
  if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  // Cuenta Moodle: el id guardado, o la cadena idnumber(uuid) → external → correos
  let uid: number | null = stu.moodle_user_id ? Number(stu.moodle_user_id) : null
  if (!uid) {
    let mu = await getUserByIdnumber(String(stu.id))
    if (!mu && stu.external_id) mu = await getUserByIdnumber(String(stu.external_id))
    if (!mu && stu.email) mu = await getUserByEmail(String(stu.email))
    if (!mu && stu.email_alt) mu = await getUserByEmail(String(stu.email_alt))
    uid = mu?.id ?? null
  }
  if (!uid) return NextResponse.json({ sin_cuenta: true, aulas: [] })

  const estadoCuenta = (await moodleUserState([uid])).get(uid) ?? null

  // Lo ACTIVO según Moodle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cursosWS: any[] = await moodleCall('core_enrol_get_users_courses', { userid: uid }, { timeoutMs: 30_000 }).catch(() => [])
  const activas = new Map<number, string>()
  for (const c of Array.isArray(cursosWS) ? cursosWS : []) activas.set(Number(c.id), String(c.shortname ?? c.fullname ?? c.id))

  // Lo ESPERADO según sus carruseles activos (resuelto por colección)
  const esperadas = new Set<number>()
  const sinAula: string[] = []
  const { data: membs } = await sb.from('academic_group_students')
    .select('group_id, status').eq('student_id', studentId).eq('status', 'activo')
  for (const m of membs ?? []) {
    try {
      const r = await loadGroupCourses(sb, String(m.group_id), await coleccionDe(sb, String(m.group_id), studentId))
      for (const a of r.courseIds) esperadas.add(Number(a))
      sinAula.push(...r.unmapped)
    } catch { /* un grupo sin resolver no tumba el reporte */ }
  }

  // Lo HISTÓRICO: aulas de sus actas
  const { data: notas } = await sb.from('academic_grades')
    .select('moodle_course_id').eq('student_id', studentId).not('moodle_course_id', 'is', null)
  const historicas = new Set<number>((notas ?? []).map((n: { moodle_course_id: number }) => Number(n.moodle_course_id)))

  const candidatas = [...new Set([...activas.keys(), ...esperadas, ...historicas])]

  // Nombre de aula y vínculo con la asignatura del ERP
  const { data: links } = candidatas.length
    ? await sb.from('moodle_course_links').select('aula_id, course_id, kind').in('aula_id', candidatas)
    : { data: [] }
  const cursoDeAula = new Map<number, string>()
  for (const l of links ?? []) {
    if (l.kind === 'asignatura' && !cursoDeAula.has(Number(l.aula_id))) cursoDeAula.set(Number(l.aula_id), String(l.course_id))
  }
  const cids = [...new Set([...cursoDeAula.values()])]
  const { data: cursos } = cids.length
    ? await sb.from('academic_courses').select('id, code, name').in('id', cids)
    : { data: [] }
  const cursoInfo = new Map<string, { id: string; code: string; name: string }>(
    ((cursos ?? []) as { id: string; code: string; name: string }[]).map(c => [String(c.id), c]))

  // Nombres de las aulas que el WS de activos no trajo
  const sinNombre = candidatas.filter(a => !activas.has(a))
  const nombreAula = new Map<number, string>(activas)
  if (sinNombre.length) {
    try {
      const r = await moodleCall('core_course_get_courses_by_field', { field: 'ids', value: sinNombre.join(',') }, { timeoutMs: 30_000 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (r?.courses ?? []) as any[]) nombreAula.set(Number(c.id), String(c.shortname ?? c.fullname ?? c.id))
    } catch { /* sin nombre no se pierde la fila */ }
  }

  // ¿Suspendida o sin matrícula? El reporte por usuario responde para
  // matrículas suspendidas (probado con los restaurados del 02-09); si no
  // devuelve nada, no hay matrícula en esa aula.
  const estados = new Map<number, 'activa' | 'suspendida' | 'sin_matricula'>()
  for (const a of activas.keys()) estados.set(a, 'activa')
  const dudosas = candidatas.filter(a => !activas.has(a))
  let idx = 0
  const worker = async () => {
    while (idx < dudosas.length) {
      const aula = dudosas[idx++]
      try {
        const r = await moodleCall('gradereport_user_get_grade_items', { courseid: aula, userid: uid }, { timeoutMs: 20_000 })
        estados.set(aula, r?.usergrades?.length ? 'suspendida' : 'sin_matricula')
      } catch { estados.set(aula, 'sin_matricula') }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))

  const aulas = candidatas.map(a => {
    const estado = estados.get(a) ?? 'sin_matricula'
    const esperada = esperadas.has(a)
    const info = cursoInfo.get(cursoDeAula.get(a) ?? '')
    let anomalia: string | null = null
    if (estado === 'activa' && !esperada) anomalia = 'acceso_de_mas'
    if (estado !== 'activa' && esperada) anomalia = 'acceso_faltante'
    return {
      aula: a,
      nombre: nombreAula.get(a) ?? `Aula ${a}`,
      curso_code: info?.code ?? null,
      curso_name: info?.name ?? null,
      estado, esperada, anomalia,
    }
  }).sort((x, y) => (x.anomalia ? 0 : 1) - (y.anomalia ? 0 : 1) || x.nombre.localeCompare(y.nombre))

  return NextResponse.json({
    uid,
    cuenta: estadoCuenta ? { suspendida: estadoCuenta.suspended, ultimo_acceso: estadoCuenta.lastaccess || null } : null,
    aulas,
    esperadas_sin_aula: [...new Set(sinAula)],
  })
}
