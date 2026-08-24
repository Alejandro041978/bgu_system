import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getEffectiveStudent } from '@/lib/student-identity'
import { asignaturasDeGrupos } from '@/lib/group-courses'
import { moodleConfigured, moodleCall, moodleUserState } from '@/lib/moodle'
import { createInboxTicket } from '@/lib/inbox-ticket'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Verificar Campus: lo que el estudiante DEBERÍA tener en Moodle según el ERP
// (su carrusel dice qué asignaturas; su colección dice en qué aula) contra lo
// que Moodle dice que TIENE (cuenta y matrículas reales, consultadas en vivo).
//
// No recibe student_id: se resuelve de la sesión, igual que el resto del
// portal. Si el estudiante ve que sus accesos no coinciden, el POST genera un
// ticket en el buzón con la foto completa, para que la universidad lo revise.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function alumnoDeSesion(sb: any) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return { error: NextResponse.json({ error: 'No es un estudiante' }, { status: 403 }) }
  const cols = 'id, first_name, last_name, second_last_name, document_number, email, email_alt, moodle_user_id, situation'
  let stu = null
  if (ident.email) {
    const { data } = await sb.from('academic_students').select(cols).eq('email', ident.email).eq('disabled', false).maybeSingle()
    stu = data
  }
  if (!stu && ident.document_number) {
    const { data } = await sb.from('academic_students').select(cols).eq('document_number', ident.document_number).maybeSingle()
    stu = data
  }
  if (!stu) return { error: NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 }) }
  return { stu }
}

interface CursoCheck {
  code: string | null; name: string | null
  aula_id: number | null; aula: string | null
  // true = matriculado en Moodle; false = no; null = no se pudo comprobar
  enrolled: boolean | null
}
interface ProgramaCheck { program: string; group: string; collection: string | null; courses: CursoCheck[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verificarCampus(sb: any, stu: any) {
  // Cuenta Moodle: existe y, si el campus responde, su estado real
  const account: { exists: boolean; suspended: boolean | null; lastaccess: number | null } = {
    exists: !!stu.moodle_user_id, suspended: null, lastaccess: null,
  }
  const vivo = moodleConfigured()
  if (vivo && stu.moodle_user_id) {
    try {
      const st = await moodleUserState([Number(stu.moodle_user_id)])
      const s = st.get(Number(stu.moodle_user_id))
      if (s) { account.suspended = s.suspended; account.lastaccess = s.lastaccess || null }
    } catch { /* el estado queda en null: "no se pudo comprobar" */ }
  }

  // Lo esperado: membresías activas de carrusel → asignaturas del grupo →
  // aula de cada una según la COLECCIÓN de su matrícula.
  const { data: members } = await sb.from('academic_group_students')
    .select('group_id, group:academic_groups(id, program_id, abbreviation, name)')
    .eq('student_id', stu.id).eq('status', 'activo')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grupos = ((members ?? []) as any[]).map(m => m.group).filter(Boolean)
  const { data: enrs } = await sb.from('academic_student_enrollments')
    .select('program_id, collection_id, program:academic_programs(name), coleccion:moodle_collections(name)')
    .eq('student_id', stu.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrDe = new Map(((enrs ?? []) as any[]).map(e => [String(e.program_id), e]))
  const cursosDe = await asignaturasDeGrupos(sb, grupos.map((g: { id: string }) => String(g.id)))

  const collectionIds = [...new Set(grupos.map((g: { program_id: string }) => enrDe.get(String(g.program_id))?.collection_id).filter(Boolean))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let links: any[] = []
  if (collectionIds.length) {
    const { data } = await sb.from('moodle_course_links')
      .select('aula_id, course_id, collection_id').eq('kind', 'asignatura').is('replaced_at', null)
      .in('collection_id', collectionIds)
    links = data ?? []
  }
  const aulaDe = new Map(links.map(l => [`${l.collection_id}|${l.course_id}`, Number(l.aula_id)]))
  const aulaIds = [...new Set(links.map(l => Number(l.aula_id)))]
  const nombreAula = new Map<number, string>()
  for (let i = 0; i < aulaIds.length; i += 150) {
    const { data } = await sb.from('moodle_aula_audit').select('aula_id, shortname').in('aula_id', aulaIds.slice(i, i + 150))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (data ?? []) as any[]) nombreAula.set(Number(a.aula_id), a.shortname ?? String(a.aula_id))
  }

  // Lo real: en qué aulas está matriculado HOY, preguntado a Moodle
  let realCourses: { id: number; fullname: string; shortname: string }[] | null = null
  if (vivo && stu.moodle_user_id) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await moodleCall('core_enrol_get_users_courses', { userid: Number(stu.moodle_user_id) }) as any[]
      realCourses = (r ?? []).map(c => ({ id: Number(c.id), fullname: String(c.fullname ?? ''), shortname: String(c.shortname ?? '') }))
    } catch { realCourses = null }
  }
  const realIds = realCourses ? new Set(realCourses.map(c => c.id)) : null

  const programs: ProgramaCheck[] = grupos.map((g: { id: string; program_id: string; abbreviation: string | null; name: string | null }) => {
    const enr = enrDe.get(String(g.program_id))
    const cid = enr?.collection_id ? String(enr.collection_id) : null
    const courses: CursoCheck[] = (cursosDe.get(String(g.id)) ?? []).map(c => {
      const aula = cid ? (aulaDe.get(`${cid}|${c.id}`) ?? null) : null
      return {
        code: c.code ?? null, name: c.name ?? null,
        aula_id: aula, aula: aula ? (nombreAula.get(aula) ?? String(aula)) : null,
        enrolled: aula == null ? null : (realIds ? realIds.has(aula) : null),
      }
    })
    return {
      program: enr?.program?.name ?? 'Programa',
      group: [g.abbreviation, g.name].filter(Boolean).join(' · '),
      collection: enr?.coleccion?.name ?? null,
      courses,
    }
  })

  // Aulas reales que el ERP no espera para este estudiante (información, no error)
  const esperadas = new Set(programs.flatMap(p => p.courses.map(c => c.aula_id).filter(Boolean))) as Set<number>
  const extras = (realCourses ?? []).filter(c => !esperadas.has(c.id)).map(c => ({ id: c.id, name: c.shortname || c.fullname }))

  return { account, programs, extras, moodle_ok: vivo && realCourses != null, checked_at: new Date().toISOString() }
}

export async function GET() {
  const sb = db()
  const r = await alumnoDeSesion(sb)
  if ('error' in r) return r.error
  return NextResponse.json(await verificarCampus(sb, r.stu))
}

// POST { note? } → genera el ticket con la foto del verificador.
export async function POST(req: NextRequest) {
  const sb = db()
  const r = await alumnoDeSesion(sb)
  if ('error' in r) return r.error
  const stu = r.stu
  const body = await req.json().catch(() => ({})) as { note?: string }

  // Un caso abierto por estudiante para este tema: reenviar el mismo reporte
  // cada vez que recarga no ayuda a nadie.
  const { data: abierto } = await sb.from('wa_conversations')
    .select('case_number').eq('student_id', stu.id).eq('status', 'open')
    .like('subject', 'Verificar Campus%').limit(1).maybeSingle()
  if (abierto) {
    return NextResponse.json({ ok: true, already: true, case_number: abierto.case_number ?? null })
  }

  const foto = await verificarCampus(sb, stu)
  const lineas: string[] = []
  lineas.push(`Cuenta Moodle: ${foto.account.exists ? (foto.account.suspended ? 'SUSPENDIDA' : foto.account.suspended === false ? 'activa' : 'existe (estado sin comprobar)') : 'SIN CUENTA'}`)
  for (const p of foto.programs) {
    lineas.push(`\n${p.program} · ${p.group}${p.collection ? ` · colección ${p.collection}` : ''}`)
    for (const c of p.courses) {
      const estado = c.aula_id == null ? 'sin aula asignada' : c.enrolled === true ? 'con acceso' : c.enrolled === false ? 'SIN ACCESO' : 'sin comprobar'
      lineas.push(`  - ${c.code ?? ''} ${c.name ?? ''} → ${c.aula ?? '—'} [${estado}]`)
    }
  }
  if (foto.extras.length) lineas.push(`\nAulas fuera de su ruta: ${foto.extras.map(x => x.name).join(', ')}`)
  if (!foto.moodle_ok) lineas.push('\n(El campus no respondió durante la verificación: contrastar a mano.)')
  if (body.note?.trim()) lineas.push(`\nLo que el estudiante reporta:\n${body.note.trim().slice(0, 1000)}`)

  const t = await createInboxTicket({
    subject: 'Verificar Campus: accesos que no coinciden',
    description: lineas.join('\n'),
    studentId: stu.id,
    language: 'es', topic: 'tecnico',
  })
  return NextResponse.json({ ok: true, case_number: t.caseNumber })
}
