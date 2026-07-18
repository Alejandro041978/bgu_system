import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { sameCourse } from '@/lib/course-match'
import { importGrades, resolveImportTarget, type ImportRow } from '@/lib/grades-write'
import { computeGraduates } from '@/lib/graduates'
import { recomputeSituations } from '@/lib/withdrawals'
import { advanceCarousels } from '@/lib/carousel'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

interface CsvRow { documento?: string; codigo?: string; asignatura?: string; anio?: string | number; bloque?: string; nota_final?: string | number }

// Importador de notas por CSV — la vía para las aulas de campus socio (otras
// plataformas virtuales que no son nuestro Moodle). Mismo destino y garantías
// que la importación de Moodle: escribe por grades-write (auditoría, filas
// editadas protegidas) y corre los efectos globales tras aplicar.
//
// POST { rows, dry } — dry:true valida y devuelve la vista previa sin escribir.
// La asignatura se resuelve DENTRO de los programas donde el estudiante está
// matriculado: código exacto o nombre (course-match). Nada se adivina fuera de
// su malla.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null) as { rows?: CsvRow[]; dry?: boolean } | null
  if (!Array.isArray(b?.rows) || !b.rows.length) {
    return NextResponse.json({ error: 'Sin filas: el CSV debe traer documento, codigo o asignatura, anio, bloque y nota_final' }, { status: 400 })
  }
  if (b.rows.length > 2000) return NextResponse.json({ error: 'Máximo 2000 filas por carga' }, { status: 400 })
  const dry = b.dry !== false

  const sb = db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readAll = async (t: string, c: string): Promise<any[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: any[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from(t).select(c).range(from, from + 999)
      const rows = data ?? []
      out.push(...rows)
      if (rows.length < 1000) break
    }
    return out
  }

  const studs = await readAll('academic_students', 'id, document_number, email, first_name, last_name, second_last_name')
  const byDoc = new Map<string, typeof studs>()
  for (const s of studs) {
    const d = String(s.document_number ?? '').trim()
    if (!d) continue
    if (!byDoc.has(d)) byDoc.set(d, [])
    byDoc.get(d)!.push(s)
  }
  const enrolls = await readAll('academic_student_enrollments', 'student_id, program_id')
  const progsOf = new Map<string, Set<string>>()
  for (const e of enrolls) {
    if (!e.student_id || !e.program_id) continue
    if (!progsOf.has(e.student_id)) progsOf.set(e.student_id, new Set())
    progsOf.get(e.student_id)!.add(e.program_id)
  }
  const courses = await readAll('academic_courses', 'id, program_id, code, name, credits')
  const coursesByProgram = new Map<string, typeof courses>()
  for (const c of courses) {
    if (!c.program_id) continue
    if (!coursesByProgram.has(c.program_id)) coursesByProgram.set(c.program_id, [])
    coursesByProgram.get(c.program_id)!.push(c)
  }
  const programs = await readAll('academic_programs', 'id, category_id')
  const cats = await readAll('academic_programs_category', 'id, passing_score')
  const passOfProgram = (pid: string): number | null => {
    const catId = programs.find(p => p.id === pid)?.category_id
    return cats.find(c => c.id === catId)?.passing_score ?? null
  }

  // Notas existentes de los documentos del archivo (para no duplicar Activa)
  const docsArchivo = [...new Set(b.rows.map(r => String(r.documento ?? '').trim()).filter(Boolean))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradesByDoc = new Map<string, any[]>()
  for (let i = 0; i < docsArchivo.length; i += 200) {
    const { data } = await sb.from('academic_grades')
      .select('external_id, document_number, course_code, course_name, final_grade, retake_grade, source')
      .in('document_number', docsArchivo.slice(i, i + 200))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (data ?? []) as any[]) {
      const k = String(g.document_number)
      if (!gradesByDoc.has(k)) gradesByDoc.set(k, [])
      gradesByDoc.get(k)!.push(g)
    }
  }

  const ok: { fila: number; document: string; student_name: string; course_code: string | null; course_name: string; grade: number; destino: string }[] = []
  const errores: { fila: number; motivo: string; documento?: string }[] = []
  const omitidas: { fila: number; motivo: string; documento?: string }[] = []
  const importRows: ImportRow[] = []
  const seen = new Set<string>()

  b.rows.forEach((r, idx) => {
    const fila = idx + 2 // 1-based + encabezado
    const doc = String(r.documento ?? '').trim()
    if (!doc) { errores.push({ fila, motivo: 'Sin documento' }); return }
    const cands = byDoc.get(doc) ?? []
    if (!cands.length) { errores.push({ fila, motivo: 'Documento no existe en el ERP', documento: doc }); return }
    if (cands.length > 1) { errores.push({ fila, motivo: 'Documento compartido por varios estudiantes', documento: doc }); return }
    const stu = cands[0]

    const nota = Number(String(r.nota_final ?? '').replace(',', '.'))
    if (!isFinite(nota) || nota < 0 || nota > 100) { errores.push({ fila, motivo: 'nota_final debe ser un número entre 0 y 100', documento: doc }); return }
    const anio = Number(r.anio)
    if (!isFinite(anio) || anio < 2000 || anio > 2100) { errores.push({ fila, motivo: 'anio inválido', documento: doc }); return }
    const bloque = String(r.bloque ?? '').trim()
    if (!bloque) { errores.push({ fila, motivo: 'Sin bloque', documento: doc }); return }

    // Asignatura: dentro de los programas del estudiante, por código exacto o nombre
    const codigo = String(r.codigo ?? '').trim().toUpperCase()
    const nombre = String(r.asignatura ?? '').trim()
    if (!codigo && !nombre) { errores.push({ fila, motivo: 'Falta codigo o asignatura', documento: doc }); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matches: any[] = []
    for (const pid of progsOf.get(stu.id) ?? []) {
      for (const c of coursesByProgram.get(pid) ?? []) {
        const hitCode = codigo && String(c.code ?? '').trim().toUpperCase() === codigo
        const hitName = nombre && sameCourse(nombre, c.name)
        if (hitCode || hitName) matches.push(c)
      }
    }
    const distinct = [...new Map(matches.map(m => [m.id, m])).values()]
    if (!distinct.length) { errores.push({ fila, motivo: `Asignatura "${codigo || nombre}" no existe en los programas del estudiante`, documento: doc }); return }
    if (distinct.length > 1) { errores.push({ fila, motivo: `Asignatura "${codigo || nombre}" es ambigua entre sus programas`, documento: doc }); return }
    const course = distinct[0]

    // ¿Ya existe esta asignatura para el alumno? skip = de Activa con nota
    // (se omite, no es error); fill = rellena la fila "en curso" y la blinda
    const target = resolveImportTarget(gradesByDoc.get(doc) ?? [],
      { code: course.code, name: course.name }, `csv:${doc}:${course.id}:${anio}:${bloque}`)
    if (target.action === 'skip') {
      omitidas.push({ fila, motivo: 'Ya registrada con nota en el ERP (Activa) — se omite, no se duplica', documento: doc })
      return
    }
    const externalId = target.external_id
    if (seen.has(externalId)) { errores.push({ fila, motivo: 'Fila duplicada dentro del archivo', documento: doc }); return }
    seen.add(externalId)

    const studentName = [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' ')
    ok.push({
      fila, document: doc, student_name: studentName, course_code: course.code, course_name: course.name, grade: nota,
      destino: target.action === 'fill' ? 'rellena pendiente' : 'nueva',
    })
    importRows.push({
      external_id: externalId,
      shield: target.shield,
      document_number: doc,
      email: stu.email ?? null,
      student_name: studentName,
      course_code: course.code,
      course_name: course.name,
      credits: course.credits ?? null,
      term_year: anio,
      term_block: bloque,
      final_grade: nota,
      passing_score: passOfProgram(course.program_id),
    })
  })

  if (dry) {
    return NextResponse.json({
      dry: true, validas: ok.length, con_error: errores.length, omitidas_activa: omitidas.length,
      ok: ok.slice(0, 500), errores: errores.slice(0, 200), omitidas: omitidas.slice(0, 200),
    })
  }
  if (errores.length) {
    return NextResponse.json({ error: `El archivo tiene ${errores.length} fila(s) con error; corrígelas antes de aplicar`, errores: errores.slice(0, 200) }, { status: 400 })
  }

  const result = await importGrades(sb, importRows, {
    origin: 'csv', userId: user.id, reason: `Carga CSV de notas (${importRows.length} filas)`,
  })

  let recompute: Record<string, unknown> | null = null
  if (result.inserted + result.updated > 0 && !result.errors.length) {
    try {
      const graduates = await computeGraduates(sb)
      const situations = await recomputeSituations(sb)
      const carousels = await advanceCarousels(sb)
      recompute = {
        egresados_detectados: graduates.graduates,
        situaciones_actualizadas: situations.updated,
        avances_de_carrusel: carousels.advanced.length,
      }
    } catch (e) {
      recompute = { error: 'Recalculo pendiente (los crons nocturnos convergen): ' + String(e) }
    }
  }
  return NextResponse.json({ ...result, recompute })
}
