import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { applyGradeEdit, type GradeChanges } from '@/lib/grades-write'
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
    'external_id, document_number, student_name, course_id, course_name, final_grade, retake_grade, estado_academico, semester_id, source, edited_at',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (query: any) => query.in('course_id', [...cursosOk]), 'external_id')

  const infoCurso = new Map(delAmbito.map((c: { id: string; name: string; program_id: string }) =>
    [String(c.id), { nombre: c.name, programa: nomPrograma.get(String(c.program_id)) ?? '—' }]))

  const filtradas = notas.filter((n: { document_number: string; student_name: string; course_id: string }) => {
    if (cursoFiltro && String(n.course_id) !== cursoFiltro) return false
    if (!q) return true
    return `${n.student_name ?? ''} ${n.document_number ?? ''}`.toLowerCase().includes(q)
  })

  filtradas.sort((a: { student_name: string }, b: { student_name: string }) =>
    String(a.student_name ?? '').localeCompare(String(b.student_name ?? '')))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = filtradas.slice(0, LIMITE).map((n: any) => ({
    external_id: n.external_id,
    document_number: n.document_number,
    student_name: n.student_name,
    course_name: infoCurso.get(String(n.course_id))?.nombre ?? n.course_name,
    programa: infoCurso.get(String(n.course_id))?.programa ?? '—',
    semester: n.semester_id ? (nomSemestre.get(String(n.semester_id)) ?? null) : null,
    final_grade: n.final_grade,
    retake_grade: n.retake_grade,
    estado: n.estado_academico ?? null,
    editada: !!n.edited_at,
  }))

  return NextResponse.json({
    titulo: TITULO[ambito],
    asignaturas: delAmbito
      .map((c: { id: string; name: string; program_id: string }) =>
        ({ id: c.id, name: c.name, programa: nomPrograma.get(String(c.program_id)) ?? '—' }))
      .sort((a: { name: string }, b: { name: string }) => String(a.name).localeCompare(String(b.name))),
    filas,
    total: filtradas.length,
    limite: LIMITE,
  })
}

export async function editar(ambito: Ambito, req: NextRequest) {
  const noAutorizado = await guardAmbito(ambito)
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { external_id?: string; changes?: GradeChanges; reason?: string } | null
  if (!body?.external_id || !body.changes) {
    return NextResponse.json({ error: 'Falta external_id o changes' }, { status: 400 })
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
  // La comprobación que de verdad acota el permiso. Sin ella, "puede editar las
  // notas de capstone" sería "puede editar cualquier nota, si sabe pedirlo".
  if (!(await notaEnAmbito(sb, body.external_id, ambito))) {
    return NextResponse.json({ error: 'Esa nota no pertenece a este ámbito.' }, { status: 403 })
  }

  const result = await applyGradeEdit(sb, {
    externalId: body.external_id, changes, reason, userId: user.id,
  })
  if (!result.ok) return NextResponse.json({ error: result.note ?? 'Error' }, { status: 500 })
  return NextResponse.json(result)
}
