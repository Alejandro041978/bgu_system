import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { esIntento } from '@/lib/grade-sources'
import { passingByCourse, passingFor } from '@/lib/passing-score'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string): Promise<any[]> {
  const out: unknown[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).range(d, d + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return out as any[]
}

// El term_block de las notas guarda el nombre del semestre con guiones bajos
// ("AY 25-26 FALL 2025" → "AY_25-26_FALL_2025"). Las notas viejas de
// SystemActiva traen "1", "2", "3" o nada: no se pueden atribuir a un semestre,
// y por eso quedan fuera de cualquier filtro por periodo. Se dice en el resumen.
//
// Se compara sin separadores porque no todos los semestres se nombraron igual:
// "AY 26 - 27 FALL 2026" lleva espacios alrededor del guion y "AY 25-26 FALL
// 2025" no. Comparar el texto tal cual dejaba fuera un año entero.
const clave = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const TOPE_DETALLE = 200

// ---------------------------------------------------------------------------
// Reporte de calificaciones.
//
// Dos filtros que se cruzan: uno académico en cascada (categoría → programa →
// asignatura) y otro de periodo (año académico y, dentro de él, semestre o
// convocatoria; o bien un carrusel, que no cuelga del año).
//
// El detalle se corta a 200 estudiantes, pero el RESUMEN se calcula siempre
// sobre la consulta completa: sirve para acotar antes de pedir el listado, y
// una consulta grande no puede quedarse sin respuesta.
// ---------------------------------------------------------------------------

// GET → catálogos para los filtros (se piden una vez y la cascada es local).
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()

  const [cats, progs, courses, years, sems, convs, groups] = await Promise.all([
    todo(sb, 'academic_programs_category', 'id, name'),
    todo(sb, 'academic_programs', 'id, name, category_id'),
    todo(sb, 'academic_courses', 'id, name, code, program_id'),
    todo(sb, 'academic_years', 'id, name, start_date'),
    todo(sb, 'academic_semesters', 'id, name, academic_year_id, start_date'),
    todo(sb, 'convocatorias', 'id, name, academic_semester_id, product_category_id'),
    todo(sb, 'academic_groups', 'id, name, abbreviation, program_id, category_id'),
  ])

  return NextResponse.json({
    categorias: cats.sort((a, b) => a.name.localeCompare(b.name)),
    programas: progs.sort((a, b) => a.name.localeCompare(b.name)),
    asignaturas: courses.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    anios: years.sort((a, b) => String(b.start_date).localeCompare(String(a.start_date))),
    semestres: sems.sort((a, b) => String(b.start_date).localeCompare(String(a.start_date))),
    convocatorias: convs.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    carruseles: groups.sort((a, b) => String(a.name).localeCompare(String(b.name))),
  })
}

interface Filtros {
  category_id?: string | null
  program_id?: string | null
  course_id?: string | null
  year_id?: string | null
  semester_id?: string | null
  convocatoria_id?: string | null
  group_id?: string | null
}

export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const f = (await req.json().catch(() => null)) as Filtros | null
  if (!f) return NextResponse.json({ error: 'Filtros ilegibles' }, { status: 400 })
  const alguno = [f.category_id, f.program_id, f.course_id, f.year_id, f.semester_id, f.convocatoria_id, f.group_id]
    .some(v => v)
  if (!alguno) return NextResponse.json({ error: 'Elige al menos un filtro: sin ninguno la consulta sería toda la base' }, { status: 400 })

  const sb = db()
  const [progs, courses, anios, sems, studs, enrs, grades, porCurso] = await Promise.all([
    todo(sb, 'academic_programs', 'id, name, category_id'),
    todo(sb, 'academic_courses', 'id, name, code, program_id'),
    todo(sb, 'academic_years', 'id, name, start_date'),
    todo(sb, 'academic_semesters', 'id, name, academic_year_id'),
    todo(sb, 'academic_students', 'id, document_number, first_name, last_name, second_last_name, situation'),
    todo(sb, 'academic_student_enrollments', 'student_id, program_id, convocatoria_id'),
    todo(sb, 'academic_grades', 'external_id, document_number, course_id, course_name, final_grade, retake_grade, passing_score, estado_academico, term_year, term_block, source, withdrawn_at'),
    passingByCourse(sb),
  ])

  // ── 1. Qué asignaturas entran (cascada categoría → programa → asignatura) ──
  const progDe = new Map(progs.map(p => [p.id, p]))
  let cursos = courses
  if (f.course_id) cursos = cursos.filter(c => c.id === f.course_id)
  else if (f.program_id) cursos = cursos.filter(c => c.program_id === f.program_id)
  else if (f.category_id) cursos = cursos.filter(c => progDe.get(c.program_id)?.category_id === f.category_id)
  const cursoIds = new Set(cursos.map(c => c.id))
  const hayFiltroAcademico = !!(f.course_id || f.program_id || f.category_id)

  // ── 2. Periodo ────────────────────────────────────────────────────────────
  // El semestre manda sobre el año; la convocatoria arrastra su semestre.
  //
  // Una nota se atribuye a un año académico por dos vías, y las dos valen:
  //   · su term_block nombra un semestre (sólo el 41% de las notas), o
  //   · su term_year, que en SystemActiva es el año de ARRANQUE del año
  //     académico. Verificado sobre las 8.712 notas que traen las dos cosas:
  //     coinciden en el 100%, sea el semestre Fall, Spring o Summer.
  //
  // Sin la segunda vía, "Master Program · AY 2023-2024" devolvía 3 notas de
  // 4.740: las de SystemActiva llevan "1", "2" o "3" en term_block —el bloque
  // dentro del programa, no un semestre del calendario— y las de Moodle no
  // llevan nada. El año, en cambio, lo tienen todas.
  //
  // Un SEMESTRE concreto sólo puede resolverse por nombre: quien únicamente
  // tiene el año no se puede colocar en Fall o en Spring sin inventar.
  //
  // Convocatoria y carrusel NO acotan el periodo: acotan a QUIÉNES. Preguntar
  // por una convocatoria es preguntar por sus estudiantes —con todas sus
  // notas—, no sólo por lo que rindieron el mismo semestre en que entraron.
  // Si además se quiere acotar el tiempo, para eso está el año.
  let bloques: Set<string> | null = null
  let anioArranque: number | null = null
  let soloSemestre = false
  if (f.semester_id) {
    const s = sems.find(x => x.id === f.semester_id)
    bloques = new Set(s ? [clave(s.name)] : [])
    soloSemestre = true
  } else if (f.year_id) {
    const y = anios.find(a => a.id === f.year_id)
    const delAnio = sems.filter(s => s.academic_year_id === f.year_id)
    anioArranque = y ? Number(String(y.start_date).slice(0, 4)) : null
    if (!delAnio.length && anioArranque == null) {
      return NextResponse.json({
        error: 'Ese año académico no tiene semestres cargados ni fecha de inicio: no hay periodo con el que cruzar las notas.',
      }, { status: 400 })
    }
    bloques = new Set(delAnio.map(s => clave(s.name)))
  }

  // ── 3. Qué estudiantes entran (convocatoria o carrusel) ───────────────────
  let docsPermitidos: Set<string> | null = null
  const docDe = new Map(studs.map(s => [s.id, String(s.document_number ?? '')]))
  if (f.convocatoria_id) {
    const ids = new Set(enrs.filter(e => e.convocatoria_id === f.convocatoria_id).map(e => e.student_id))
    docsPermitidos = new Set([...ids].map(id => docDe.get(id)).filter(Boolean) as string[])
  }
  if (f.group_id) {
    const miembros = await todo(sb, 'academic_group_students', 'group_id, student_id, status')
    const ids = new Set(miembros.filter(m => m.group_id === f.group_id && m.status === 'activo').map(m => m.student_id))
    const docs = new Set([...ids].map(id => docDe.get(id)).filter(Boolean) as string[])
    docsPermitidos = docsPermitidos ? new Set([...docs].filter(d => docsPermitidos!.has(d))) : docs
  }

  // ── 4. Filtrar las notas ──────────────────────────────────────────────────
  const stuDe = new Map(studs.map(s => [String(s.document_number ?? ''), s]))
  const cursoDe = new Map(courses.map(c => [c.id, c]))
  let sinPeriodo = 0
  let porSemestre = 0
  let porAnio = 0

  const filas = []
  for (const g of grades) {
    // Convalidaciones, validaciones y filas de plan no son calificaciones.
    if (!esIntento(g)) continue
    if (g.withdrawn_at) continue
    if (hayFiltroAcademico && !(g.course_id && cursoIds.has(g.course_id))) continue
    if (docsPermitidos && !docsPermitidos.has(String(g.document_number ?? ''))) continue
    if (bloques) {
      const b = clave(g.term_block)
      if (bloques.has(b)) porSemestre++
      else if (!soloSemestre && anioArranque != null && Number(g.term_year) === anioArranque) porAnio++
      else {
        // No se descarta por pertenecer a otro periodo: es que esa nota no
        // dice a cuál pertenece.
        if (!b.startsWith('AY') && g.term_year == null) sinPeriodo++
        continue
      }
    }
    const s = stuDe.get(String(g.document_number ?? ''))
    const c = g.course_id ? cursoDe.get(g.course_id) : null
    const p = c ? progDe.get(c.program_id) : null

    const nota = (g.retake_grade ?? g.final_grade) as number | null
    const min = passingFor(g, porCurso)
    // El estado calculado manda: la nota del campus es un acumulado sobre el
    // 100% del curso, no un promedio de lo rendido.
    const estado = nota == null ? 'en_proceso'
      : g.estado_academico === 'pendiente' ? 'en_proceso'
      : g.estado_academico === 'aprobado' ? 'aprobado'
      : g.estado_academico === 'reprobado' ? 'desaprobado'
      : (min != null ? (Number(nota) >= min ? 'aprobado' : 'desaprobado') : 'aprobado')

    filas.push({
      external_id: g.external_id,
      documento: g.document_number,
      estudiante: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ') : '(sin ficha)',
      situacion: s?.situation ?? null,
      programa: p?.name ?? null,
      asignatura: c?.name ?? g.course_name,
      codigo: c?.code ?? null,
      periodo: g.term_block ?? (g.term_year != null ? String(g.term_year) : null),
      nota: nota != null ? Number(nota) : null,
      minimo: min,
      estado,
    })
  }

  // ── 5. Resumen: SIEMPRE, aunque el detalle no venga ───────────────────────
  const conNota = filas.filter(x => x.nota != null && x.estado !== 'en_proceso')
  const estudiantes = new Set(filas.map(x => x.documento)).size
  const resumen = {
    estudiantes,
    calificaciones: filas.length,
    aprobados: filas.filter(x => x.estado === 'aprobado').length,
    en_proceso: filas.filter(x => x.estado === 'en_proceso').length,
    desaprobados: filas.filter(x => x.estado === 'desaprobado').length,
    // Promedio sobre las notas cerradas —aprobadas y desaprobadas—: las que
    // están en proceso son acumulados a medio camino y promediarlas hundiría
    // la media sin significar nada.
    promedio: conNota.length
      ? Math.round((conNota.reduce((s, x) => s + Number(x.nota), 0) / conNota.length) * 100) / 100
      : null,
    notas_promediadas: conNota.length,
    sin_periodo: sinPeriodo,
    por_semestre: porSemestre,
    por_anio: porAnio,
    solo_semestre: soloSemestre,
  }

  const detalle = estudiantes <= TOPE_DETALLE
  return NextResponse.json({
    resumen,
    tope: TOPE_DETALLE,
    detalle,
    aviso: detalle ? null
      : `La consulta alcanza a ${estudiantes} estudiantes (el tope del detalle son ${TOPE_DETALLE}). El resumen está completo; afina los filtros para ver el listado.`,
    filas: detalle
      ? filas.sort((a, b) => a.estudiante.localeCompare(b.estudiante) || String(a.asignatura).localeCompare(String(b.asignatura)))
      : [],
  })
}
