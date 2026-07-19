import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { placeStudentInEntry } from '@/lib/carousel'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET → catálogo de programas (con categoría, para filtrar por la convocatoria)
// GET ?q= → busca estudiantes por nombre, documento o correo (máx. 20)
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const q = req.nextUrl.searchParams.get('q')?.trim()

  if (!q) {
    const { data: programs } = await sb.from('academic_programs')
      .select('id, name, category_id').order('name')
    return NextResponse.json({ programs: programs ?? [] })
  }

  // ilike no admite comas/paréntesis dentro de .or sin escapar: se limpian
  const safe = q.replace(/[,()]/g, ' ').trim()
  const { data: students } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, document_number, email, situation')
    .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,second_last_name.ilike.%${safe}%,document_number.ilike.%${safe}%,email.ilike.%${safe}%`)
    .limit(20)

  // Matrículas existentes de los encontrados (para mostrar en qué programas ya están)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found = (students ?? []) as any[]
  const ids = found.map(s => s.id)
  const enrByStudent = new Map<string, string[]>()
  if (ids.length) {
    const { data: enr } = await sb.from('academic_student_enrollments')
      .select('student_id, academic_programs(name)').in('student_id', ids)
    for (const e of (enr ?? []) as { student_id: string; academic_programs: { name: string } | null }[]) {
      if (!enrByStudent.has(e.student_id)) enrByStudent.set(e.student_id, [])
      if (e.academic_programs?.name) enrByStudent.get(e.student_id)!.push(e.academic_programs.name)
    }
  }

  return NextResponse.json({
    students: found.map(s => ({
      id: s.id,
      name: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '),
      document: String(s.document_number ?? ''),
      email: s.email ?? null,
      situation: s.situation ?? null,
      programs: enrByStudent.get(s.id) ?? [],
    })),
  })
}

// POST → matricula: usa el estudiante existente (student_id) o crea uno nuevo
// (new_student), inserta la matrícula (programa + convocatoria) e intenta la
// colocación automática en el carrusel de entrada del programa.
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { student_id, new_student, program_id, convocatoria_id, enrollment_date } = (body ?? {}) as {
    student_id?: string
    new_student?: { first_name?: string; last_name?: string; second_last_name?: string; document_number?: string; email?: string; phone_number?: string }
    program_id?: string
    convocatoria_id?: string
    enrollment_date?: string
  }
  if (!program_id || !convocatoria_id) return NextResponse.json({ error: 'Faltan programa o convocatoria' }, { status: 400 })
  if (!student_id && !new_student) return NextResponse.json({ error: 'Falta el estudiante (existente o nuevo)' }, { status: 400 })

  const sb = db()

  // El programa debe pertenecer a la categoría de la convocatoria
  const [{ data: conv }, { data: prog }] = await Promise.all([
    sb.from('convocatorias').select('id, name, product_category_id').eq('id', convocatoria_id).maybeSingle(),
    sb.from('academic_programs').select('id, name, category_id').eq('id', program_id).maybeSingle(),
  ])
  if (!conv) return NextResponse.json({ error: 'Convocatoria no encontrada' }, { status: 404 })
  if (!prog) return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 })
  if (conv.product_category_id && prog.category_id !== conv.product_category_id) {
    return NextResponse.json({ error: 'El programa no pertenece a la categoría de la convocatoria' }, { status: 400 })
  }

  // Resolver el estudiante
  let sid = student_id ?? null
  let created = false
  if (!sid) {
    const ns = new_student!
    if (!ns.first_name?.trim() || !ns.last_name?.trim() || !ns.document_number?.trim()) {
      return NextResponse.json({ error: 'Nombres, primer apellido y documento son obligatorios' }, { status: 400 })
    }
    const doc = ns.document_number.trim()
    const { data: dup } = await sb.from('academic_students')
      .select('id, first_name, last_name').eq('document_number', doc).limit(1)
    if ((dup ?? []).length) {
      return NextResponse.json({ error: `Ya existe un estudiante con el documento ${doc}: usa la búsqueda para seleccionarlo` }, { status: 409 })
    }
    sid = crypto.randomUUID()
    const { error } = await sb.from('academic_students').insert({
      id: sid,
      first_name: ns.first_name.trim(),
      last_name: ns.last_name.trim(),
      second_last_name: ns.second_last_name?.trim() || null,
      document_number: doc,
      email: ns.email?.trim() || null,
      phone_number: ns.phone_number?.trim() || null,
      situation: 'activo',
      situation_source: 'auto',
    })
    if (error) return NextResponse.json({ error: `No se pudo crear el estudiante: ${error.message}` }, { status: 500 })
    created = true
  } else {
    const { data: s } = await sb.from('academic_students').select('id').eq('id', sid).maybeSingle()
    if (!s) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })
  }

  // Sin matrícula duplicada en el mismo programa
  const { data: existing } = await sb.from('academic_student_enrollments')
    .select('id').eq('student_id', sid).eq('program_id', program_id).limit(1)
  if ((existing ?? []).length) {
    return NextResponse.json({ error: 'El estudiante ya tiene una matrícula en este programa' }, { status: 409 })
  }

  const enrollmentId = crypto.randomUUID()
  const { error: enrErr } = await sb.from('academic_student_enrollments').insert({
    id: enrollmentId,
    student_id: sid,
    program_id,
    convocatoria_id,
    enrollment_date: (enrollment_date?.trim() || new Date().toISOString().slice(0, 10)),
  })
  if (enrErr) return NextResponse.json({ error: `No se pudo crear la matrícula: ${enrErr.message}` }, { status: 500 })

  // Colocación automática: solo si el programa tiene una única entrada natural;
  // con varias (variantes) la elección queda para la bandeja.
  const placement = await placeStudentInEntry(sb, sid, program_id)
  let group_label: string | null = null
  if (placement.ok && placement.group_id) {
    const { data: g } = await sb.from('academic_groups')
      .select('abbreviation, name').eq('id', placement.group_id).maybeSingle()
    if (g) group_label = [g.abbreviation, g.name].filter(Boolean).join(' · ')
  }

  return NextResponse.json({
    ok: true,
    student_id: sid,
    student_created: created,
    enrollment_id: enrollmentId,
    program: prog.name,
    convocatoria: conv.name,
    placement: { ...placement, group_label },
  })
}
