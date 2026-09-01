import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { applyGradeEdit, fetchByIn, stableUuid, type GradeChanges } from '@/lib/grades-write'
import { cursosDelAmbito, notaEnAmbito, guardAmbito, TITULO, type Ambito } from '@/lib/grade-scope'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: any, tabla: string, cols: string, filtro?: (q: any) => any, orden = 'id'): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    // El orden explícito es lo que hace fiable la paginación: sin ORDER BY,
    // Postgres no garantiza el mismo orden entre una página y la siguiente y el
    // .range() puede saltarse filas. Hoy el ámbito tiene 1.025 notas, así que ya
    // pagina de verdad.
    let q = sb.from(tabla).select(cols).order(orden).range(from, from + 999)
    if (filtro) q = filtro(q)
    const { data, error } = await q
    // Un fallo NO puede devolver una lista vacía. Quien llama la lee como "no
    // hay nada" y la pantalla dice "0 inscripciones en el ámbito", que es una
    // mentira tranquila: parece un dato y es una consulta rota. Pasó con esta
    // misma página —pedía la columna `semester`, que se llama `semester_id`— y
    // el síntoma fue un buscador que nunca encontraba a nadie.
    if (error) throw new Error(`${tabla}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

const LIMITE = 400

// ---------------------------------------------------------------------------
// El motor compartido de las dos páginas de edición acotada. Las dos hacen lo
// mismo sobre conjuntos distintos de asignaturas, así que la diferencia es un
// parámetro y no dos copias que se van separando con los meses.
// ---------------------------------------------------------------------------

export async function listar(ambito: Ambito, req: NextRequest) {
  const noAutorizado = await guardAmbito(ambito)
  if (noAutorizado) return noAutorizado
  try {
    return await listarInterno(ambito, req)
  } catch (e) {
    // Se responde con el error a la vista. Devolver una lista vacía haría que la
    // pantalla dijera "sin resultados", que es indistinguible de "este
    // estudiante no tiene capstone" — y manda a buscar el problema al sitio
    // equivocado.
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo leer el listado' }, { status: 500 })
  }
}

async function listarInterno(ambito: Ambito, req: NextRequest) {
  const sb = db()
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
  const cursoFiltro = req.nextUrl.searchParams.get('course') ?? ''

  const cursosOk = await cursosDelAmbito(sb, ambito)
  if (!cursosOk.size) {
    return NextResponse.json({ titulo: TITULO[ambito], asignaturas: [], filas: [], total: 0, sin_alcance: true })
  }

  const cursos = await todo(sb, 'academic_courses', 'id, name, code, program_id')
  const programas = await todo(sb, 'academic_programs', 'id, name')
  const nomPrograma = new Map(programas.map((p: { id: string; name: string }) => [String(p.id), p.name]))
  const delAmbito = cursos.filter((c: { id: string }) => cursosOk.has(String(c.id)))

  // El periodo se guarda como semester_id y se resuelve contra el catálogo. La
  // columna `semester` no existe: pedirla devolvía error, y como el lector lo
  // tragaba, la página mostraba "0 inscripciones" con el desplegable lleno.
  const semestres = await todo(sb, 'academic_semesters', 'id, name')
  const nomSemestre = new Map(semestres.map((s: { id: string; name: string }) => [String(s.id), s.name]))

  const notas = await todo(sb, 'academic_grades',
    'external_id, student_id, document_number, student_name, course_id, course_name, final_grade, retake_grade, estado_academico, semester_id, source, edited_at, course_enrollment_id, withdrawn_at',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (query: any) => query.in('course_id', [...cursosOk]), 'external_id')

  // El listado sale del REGISTRO, no de las notas.
  //
  // Antes salía de academic_grades, y esta página existe justamente para las
  // asignaturas cuya nota todavía NO existe: la dicta otra institución y
  // alguien tiene que traerla a mano. Con la nota como punto de partida, el
  // alumno que más la necesita —el que no tiene ninguna— era el único que no
  // aparecía. El buscador decía "0 inscripciones en el ámbito" y el sitio donde
  // mirar parecía ser el buscador (18/08/2026).
  //
  // Desde que el registro curricular se separó de las calificaciones, lo que un
  // estudiante lleva inscrito vive en academic_course_enrollments. Ese es el
  // universo correcto: cada inscripción del ámbito es una fila, con su nota si
  // ya la tiene y vacía si no.
  const matriculas = await todo(sb, 'academic_course_enrollments', 'id, student_id, course_id, status',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (query: any) => query.in('course_id', [...cursosOk]))
  const vivas = matriculas.filter((m: { status: string }) => m.status !== 'retirada')

  const estudiantes = vivas.length
    ? await fetchByIn(sb, 'academic_students', 'id, first_name, last_name, second_last_name, document_number',
      'id', [...new Set(vivas.map((m: { student_id: string }) => String(m.student_id)))])
    : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoEst = new Map(estudiantes.map((e: any) => [String(e.id), {
    nombre: [e.first_name, e.last_name, e.second_last_name].filter(Boolean).join(' '),
    documento: e.document_number == null ? null : String(e.document_number),
  }]))

  // La nota de una inscripción: por su enlace directo cuando lo tiene, y si no
  // por estudiante + asignatura (fase 2 documento→uuid; el documento queda de
  // respaldo para notas que aún no tengan uuid).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const porMatricula = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const porPersonaCurso = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const n of notas as any[]) {
    if (n.withdrawn_at) continue
    if (n.course_enrollment_id) porMatricula.set(String(n.course_enrollment_id), n)
    const k = n.student_id ? `sid:${n.student_id}|${n.course_id}` : `doc:${n.document_number ?? ''}|${n.course_id}`
    // Con varios intentos manda el que tenga nota, para no ofrecer rellenar algo
    // que ya está calificado.
    const previa = porPersonaCurso.get(k)
    if (!previa || ((previa.retake_grade ?? previa.final_grade) == null && (n.retake_grade ?? n.final_grade) != null)) porPersonaCurso.set(k, n)
  }

  const infoCurso = new Map(delAmbito.map((c: { id: string; name: string; program_id: string }) =>
    [String(c.id), { nombre: c.name, programa: nomPrograma.get(String(c.program_id)) ?? '—' }]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crudas = vivas.map((m: any) => {
    const est = infoEst.get(String(m.student_id))
    const n = porMatricula.get(String(m.id))
      ?? porPersonaCurso.get(`sid:${m.student_id}|${m.course_id}`)
      ?? porPersonaCurso.get(`doc:${est?.documento ?? ''}|${m.course_id}`)
      ?? null
    return {
      external_id: n?.external_id ?? null,
      enrollment_id: String(m.id),
      student_id: String(m.student_id),
      course_id: String(m.course_id),
      document_number: est?.documento ?? n?.document_number ?? null,
      student_name: est?.nombre ?? n?.student_name ?? '—',
      course_name: infoCurso.get(String(m.course_id))?.nombre ?? n?.course_name ?? '—',
      programa: infoCurso.get(String(m.course_id))?.programa ?? '—',
      semester: n?.semester_id ? (nomSemestre.get(String(n.semester_id)) ?? null) : null,
      final_grade: n?.final_grade ?? null,
      retake_grade: n?.retake_grade ?? null,
      estado: n?.estado_academico ?? null,
      editada: !!n?.edited_at,
    }
  })

  // Notas del ámbito que no cuelgan de ninguna inscripción viva: se muestran
  // igual. Esta pantalla no es el sitio para hacer desaparecer una calificación
  // que existe, aunque su registro esté incompleto.
  const yaMostradas = new Set(crudas.filter(f => f.external_id).map(f => String(f.external_id)))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const huerfanas = (notas as any[]).filter(n => !n.withdrawn_at && !yaMostradas.has(String(n.external_id))).map(n => ({
    external_id: String(n.external_id),
    enrollment_id: null as string | null,
    student_id: null as string | null,
    course_id: String(n.course_id),
    document_number: n.document_number ?? null,
    student_name: n.student_name ?? '—',
    course_name: infoCurso.get(String(n.course_id))?.nombre ?? n.course_name ?? '—',
    programa: infoCurso.get(String(n.course_id))?.programa ?? '—',
    semester: n.semester_id ? (nomSemestre.get(String(n.semester_id)) ?? null) : null,
    final_grade: n.final_grade ?? null,
    retake_grade: n.retake_grade ?? null,
    estado: n.estado_academico ?? null,
    editada: !!n.edited_at,
  }))

  const filtradas = [...crudas, ...huerfanas].filter(f => {
    if (cursoFiltro && String(f.course_id) !== cursoFiltro) return false
    if (!q) return true
    return `${f.student_name ?? ''} ${f.document_number ?? ''}`.toLowerCase().includes(q)
  })

  // Primero lo que falta por calificar, que es el trabajo de esta pantalla.
  filtradas.sort((a, b) =>
    Number(a.final_grade != null) - Number(b.final_grade != null) ||
    String(a.student_name ?? '').localeCompare(String(b.student_name ?? '')))

  const filas = filtradas.slice(0, LIMITE)
  const sinNota = filtradas.filter(f => f.final_grade == null && f.retake_grade == null).length

  return NextResponse.json({
    titulo: TITULO[ambito],
    asignaturas: delAmbito
      .map((c: { id: string; name: string; program_id: string }) =>
        ({ id: c.id, name: c.name, programa: nomPrograma.get(String(c.program_id)) ?? '—' }))
      .sort((a: { name: string }, b: { name: string }) => String(a.name).localeCompare(String(b.name))),
    filas,
    total: filtradas.length,
    sin_nota: sinNota,
    limite: LIMITE,
  })
}

// Abre la fila de nota de una inscripción que todavía no la tiene. Devuelve el
// external_id, o el motivo por el que no se puede.
async function crearNotaDeMatricula(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, enrollmentId: string, ambito: Ambito,
): Promise<{ external_id: string } | { error: string; status: number }> {
  const { data: mat } = await sb.from('academic_course_enrollments')
    .select('id, student_id, course_id, status').eq('id', enrollmentId).maybeSingle()
  if (!mat) return { error: 'Esa inscripción no existe', status: 404 }
  if (mat.status === 'retirada') return { error: 'Esa asignatura está retirada: no se le puede poner nota', status: 400 }

  // El ámbito se comprueba sobre la ASIGNATURA, antes de crear nada.
  const cursosOk = await cursosDelAmbito(sb, ambito)
  if (!cursosOk.has(String(mat.course_id))) {
    return { error: 'Esa asignatura no pertenece a este ámbito.', status: 403 }
  }

  // Si ya hay nota para esa matrícula, se usa esa en vez de crear otra: dos
  // filas para la misma inscripción es justo el desorden que costó limpiar.
  const { data: ya } = await sb.from('academic_grades')
    .select('external_id').eq('course_enrollment_id', enrollmentId).is('withdrawn_at', null).maybeSingle()
  if (ya) return { external_id: String(ya.external_id) }

  const { data: est } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, document_number, email').eq('id', mat.student_id).maybeSingle()
  if (!est) return { error: 'No se encontró al estudiante de esa inscripción', status: 404 }
  const { data: cur } = await sb.from('academic_courses')
    .select('id, name, code, credits').eq('id', mat.course_id).maybeSingle()
  if (!cur) return { error: 'No se encontró la asignatura de esa inscripción', status: 404 }

  const externalId = stableUuid(`scoped-grade:${enrollmentId}`)
  const { error } = await sb.from('academic_grades').insert({
    external_id: externalId,
    student_id: String(est.id),
    document_number: est.document_number == null ? null : String(est.document_number),
    email: est.email ?? null,
    student_name: [est.first_name, est.last_name, est.second_last_name].filter(Boolean).join(' '),
    course_id: String(cur.id),
    course_code: cur.code ?? null,
    course_name: cur.name ?? null,
    credits: cur.credits ?? null,
    course_enrollment_id: enrollmentId,
    final_grade: null,
    source: 'erp',
  })
  if (error) return { error: `no se pudo abrir la nota: ${error.message}`, status: 500 }
  return { external_id: externalId }
}

export async function editar(ambito: Ambito, req: NextRequest) {
  const noAutorizado = await guardAmbito(ambito)
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { external_id?: string; enrollment_id?: string; changes?: GradeChanges; reason?: string } | null
  if (!body?.changes || (!body.external_id && !body.enrollment_id)) {
    return NextResponse.json({ error: 'Falta external_id o enrollment_id, y changes' }, { status: 400 })
  }
  const reason = (body.reason ?? '').trim()
  if (!reason) return NextResponse.json({ error: 'El motivo es obligatorio' }, { status: 400 })

  for (const k of ['final_grade', 'retake_grade'] as const) {
    const v = body.changes[k]
    if (v != null && (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 100)) {
      return NextResponse.json({ error: `${k} debe ser un número entre 0 y 100` }, { status: 400 })
    }
  }
  // El nombre de la asignatura no se toca desde aquí: cambiarlo movería la nota
  // fuera del ámbito que autoriza a editarla.
  const changes: GradeChanges = { final_grade: body.changes.final_grade, retake_grade: body.changes.retake_grade }

  const sb = db()

  // Primera calificación de una inscripción que aún no tiene fila de nota.
  //
  // Se crea vacía y acto seguido se edita por el camino de siempre, para que el
  // valor quede auditado igual que cualquier otro cambio: quién, valor
  // anterior, motivo. Crear la fila ya con la nota puesta la metería sin rastro.
  let externalId = body.external_id ?? null
  if (!externalId) {
    const creada = await crearNotaDeMatricula(sb, String(body.enrollment_id), ambito)
    if ('error' in creada) return NextResponse.json({ error: creada.error }, { status: creada.status })
    externalId = creada.external_id
  }

  // La comprobación que de verdad acota el permiso. Sin ella, "puede editar las
  // notas de capstone" sería "puede editar cualquier nota, si sabe pedirlo".
  if (!(await notaEnAmbito(sb, externalId, ambito))) {
    return NextResponse.json({ error: 'Esa nota no pertenece a este ámbito.' }, { status: 403 })
  }

  const result = await applyGradeEdit(sb, {
    externalId, changes, reason, userId: user.id,
  })
  if (!result.ok) return NextResponse.json({ error: result.note ?? 'Error' }, { status: 500 })
  return NextResponse.json(result)
}
