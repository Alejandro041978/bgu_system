import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'
import { SYLLABI_BUCKET, syllabusVigente } from '@/lib/syllabi'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET ?program_id= → asignaturas del programa con sus sílabos (vigente + historia)
// GET             → catálogo de programas y semestres
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()

  const programId = req.nextUrl.searchParams.get('program_id')
  if (!programId) {
    const [{ data: programs }, { data: semesters }] = await Promise.all([
      sb.from('academic_programs').select('id, name, code').order('name'),
      sb.from('academic_semesters').select('id, name, start_date').order('start_date', { ascending: false }),
    ])
    return NextResponse.json({ programs: programs ?? [], semesters: semesters ?? [] })
  }

  const { data: courses } = await sb.from('academic_courses')
    .select('id, name, code, credits, level').eq('program_id', programId).order('code')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = ((courses ?? []) as any[]).map(c => c.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let syl: any[] = []
  if (ids.length) {
    const { data } = await sb.from('course_syllabi')
      .select('id, course_id, semester_id, file_name, file_size, note, uploaded_at, academic_semesters(name, start_date)')
      .in('course_id', ids)
    syl = data ?? []
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const porCurso = new Map<string, unknown[]>()
  for (const s of syl) {
    const fila = {
      id: s.id, semester_id: s.semester_id,
      semester: s.academic_semesters?.name ?? '—',
      semester_start: s.academic_semesters?.start_date ?? null,
      file_name: s.file_name, file_size: s.file_size, note: s.note, uploaded_at: s.uploaded_at,
    }
    const l = porCurso.get(s.course_id) ?? []; l.push(fila); porCurso.set(s.course_id, l)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((courses ?? []) as any[]).map(c => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lista = ((porCurso.get(c.id) ?? []) as any[])
      .sort((a, b) => String(b.semester_start ?? '').localeCompare(String(a.semester_start ?? '')))
    const v = syllabusVigente(lista, hoy)
    return { ...c, syllabi: lista, vigente_id: v?.id ?? null }
  })

  return NextResponse.json({ courses: rows })
}

// POST (multipart) → sube un sílabo. Campos: course_id, semester_id, file, note
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Envío inválido' }, { status: 400 })
  const courseId = String(form.get('course_id') ?? '')
  const semesterId = String(form.get('semester_id') ?? '')
  const note = String(form.get('note') ?? '').trim() || null
  const file = form.get('file')
  if (!courseId || !semesterId) return NextResponse.json({ error: 'Falta la asignatura o el semestre de vigencia' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'El sílabo debe ser un PDF' }, { status: 400 })
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'El PDF supera los 20 MB' }, { status: 400 })

  const sb = db()
  const { data: course } = await sb.from('academic_courses').select('id, program_id, code').eq('id', courseId).maybeSingle()
  if (!course) return NextResponse.json({ error: 'Asignatura no encontrada' }, { status: 404 })
  const { data: sem } = await sb.from('academic_semesters').select('id, name').eq('id', semesterId).maybeSingle()
  if (!sem) return NextResponse.json({ error: 'Semestre no encontrado' }, { status: 404 })

  // Un sílabo por asignatura y semestre: si ya hay uno, se reemplaza el archivo
  // en vez de crear un segundo. Subir otra vez para el mismo semestre es
  // corregir el documento, no versionar.
  const { data: previo } = await sb.from('course_syllabi')
    .select('id, file_path').eq('course_id', courseId).eq('semester_id', semesterId).maybeSingle()

  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]/g, '_')
  const path = `${course.program_id}/${courseId}/${semesterId}-${Date.now()}-${limpio(file.name)}`
  const buf = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await sb.storage.from(SYLLABI_BUCKET)
    .upload(path, buf, { contentType: 'application/pdf', upsert: false })
  if (upErr) return NextResponse.json({ error: 'No se pudo subir el archivo: ' + upErr.message }, { status: 500 })

  const fila = {
    course_id: courseId, semester_id: semesterId, file_path: path,
    file_name: file.name, file_size: file.size, note,
    uploaded_by: user?.id ?? null, uploaded_at: new Date().toISOString(),
  }
  const { error } = previo
    ? await sb.from('course_syllabi').update(fila).eq('id', previo.id)
    : await sb.from('course_syllabi').insert(fila)
  if (error) {
    // El registro manda: un archivo suelto en Storage al que no apunta nada es
    // basura invisible. Si la fila no entra, el archivo se retira.
    await sb.storage.from(SYLLABI_BUCKET).remove([path]).then(() => null, () => null)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // El archivo anterior de ese mismo semestre ya no lo apunta nadie.
  if (previo?.file_path) await sb.storage.from(SYLLABI_BUCKET).remove([previo.file_path]).then(() => null, () => null)

  return NextResponse.json({ ok: true, reemplazado: !!previo, semestre: sem.name })
}

// DELETE { id } → quita un sílabo (y su archivo)
export async function DELETE(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const b = await req.json().catch(() => null) as { id?: string } | null
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()

  const { data: s } = await sb.from('course_syllabi').select('id, file_path').eq('id', b.id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Sílabo no encontrado' }, { status: 404 })

  const { error } = await sb.from('course_syllabi').delete().eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.storage.from(SYLLABI_BUCKET).remove([s.file_path]).then(() => null, () => null)
  return NextResponse.json({ ok: true })
}
