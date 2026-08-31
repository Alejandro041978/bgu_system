// ---------------------------------------------------------------------------
// Matrícula por asignatura: resolución y reconstrucción.
//
// Una fila de academic_course_enrollments = un intento de un estudiante en una
// asignatura del plan. Es el padrón (quién debe estar en el aula), la llave de
// la política (un intento 2 es lo único que autoriza a Moodle a escribir sobre
// una asignatura que ya tiene nota de SystemActiva) y el origen del periodo.
//
// El emparejamiento nota → asignatura usa courseNameKey, el MISMO de
// course-match.ts. No se replica la regla aquí: si divergiera, el acta y la
// matrícula contarían asignaturas distintas para el mismo estudiante.
//
// Se acota al programa del estudiante antes de comparar nombres. Eso es lo que
// vuelve fiable un emparejamiento por texto: 262 de las 432 asignaturas
// comparten código con otra ("101" es el código de 54 asignaturas distintas),
// pero dentro de un mismo programa los nombres no colisionan.
// ---------------------------------------------------------------------------
import { courseNameKey } from './course-match'

export interface CursoMalla { id: string; program_id: string | null; name: string | null; code: string | null }
export interface NotaMin {
  external_id: string
  document_number: string | null
  course_name: string | null
  course_code: string | null
  final_grade: number | null
  retake_grade: number | null
  passing_score: number | null
  term_year: number | null
  term_block: string | null
  // El periodo con la nomenclatura del ERP. term_year y term_block son de
  // SystemActiva y están en retirada; éste es el que pasa al registro.
  semester_id?: string | null
  withdrawn_at: string | null
  synced_at: string | null
  source: string | null
}

export type MotivoSinResolver = 'sin_alumno' | 'sin_programa' | 'otro_programa' | 'fuera_de_malla' | 'homonima_ambigua'

export interface Resolucion {
  course_id: string | null
  program_id: string | null
  ambiguo: boolean
  motivo: MotivoSinResolver | null
}

// Índice de asignaturas por programa + nombre normalizado.
export function indexarMalla(courses: CursoMalla[]) {
  const porProgNombre = new Map<string, CursoMalla[]>()
  const porNombre = new Map<string, CursoMalla[]>()
  for (const c of courses) {
    const k = courseNameKey(c.name)
    if (!k) continue
    const pk = `${c.program_id}|${k}`
    if (!porProgNombre.has(pk)) porProgNombre.set(pk, [])
    porProgNombre.get(pk)!.push(c)
    if (!porNombre.has(k)) porNombre.set(k, [])
    porNombre.get(k)!.push(c)
  }
  return { porProgNombre, porNombre }
}

// A qué asignatura del plan pertenece esta nota.
export function resolverAsignatura(
  nota: { course_name: string | null },
  programasDelAlumno: string[] | null | undefined,
  idx: ReturnType<typeof indexarMalla>,
): Resolucion {
  if (!programasDelAlumno || !programasDelAlumno.length) {
    return { course_id: null, program_id: null, ambiguo: false, motivo: 'sin_programa' }
  }
  const k = courseNameKey(nota.course_name)
  if (!k) return { course_id: null, program_id: null, ambiguo: false, motivo: 'fuera_de_malla' }

  const hits: CursoMalla[] = []
  for (const p of programasDelAlumno) hits.push(...(idx.porProgNombre.get(`${p}|${k}`) ?? []))

  if (hits.length === 1) {
    return { course_id: hits[0].id, program_id: hits[0].program_id, ambiguo: false, motivo: null }
  }
  if (hits.length > 1) {
    // El alumno está en dos programas que comparten el nombre de la asignatura.
    // NO se elige: elegir "de forma determinista por id" era un sorteo de
    // UUIDs, y así 27 notas de 8 estudiantes acabaron en el programa
    // equivocado (Supply Chain del Bachelor asignada al MBA — caso Ramos
    // Escobal, corregido 31-08-2026 con la evidencia de la matrícula de
    // Activa). Una homónima ambigua se queda sin resolver y va a revisión:
    // la evidencia (matrícula de origen, aula, periodo) la decide una
    // persona, no el azar.
    return { course_id: null, program_id: null, ambiguo: true, motivo: 'homonima_ambigua' }
  }
  // La asignatura existe en la malla, pero de un programa que el alumno no
  // cursa. No se adivina: suele ser una matrícula de programa incompleta o un
  // upgrade, y asignarla al azar mete la nota en un plan que no es el suyo.
  if ((idx.porNombre.get(k) ?? []).length) {
    return { course_id: null, program_id: null, ambiguo: false, motivo: 'otro_programa' }
  }
  return { course_id: null, program_id: null, ambiguo: false, motivo: 'fuera_de_malla' }
}

// ---------------------------------------------------------------------------
// TODAS las asignaturas del plan a las que corresponde una nota.
//
// Existe porque una misma nota puede pertenecer a dos mallas a la vez. Nueve
// estudiantes cursan Administración y Contabilidad, que comparten dieciocho
// asignaturas: cuando alguno aprueba "Taxation" lo hace una vez y le cuenta en
// los dos bachilleres.
//
// La regla de la institución es que en ese caso se paga en los dos programas
// (Dirección, 14-08-2026). Así que el registro necesita una fila por malla, no
// una elegida entre las dos: si solo se abriera una, el otro programa contaría
// 87 créditos en vez de 120 y su precio oficial caería sin que nadie lo haya
// decidido.
//
// resolverAsignatura sigue existiendo para quien necesita UNA respuesta —el
// importador tiene que escribir la nota en un sitio— pero el registro usa ésta.
// ---------------------------------------------------------------------------
export function resolverTodasLasAsignaturas(
  nota: { course_name: string | null },
  programasDelAlumno: string[] | null | undefined,
  idx: ReturnType<typeof indexarMalla>,
): CursoMalla[] {
  if (!programasDelAlumno?.length) return []
  const k = courseNameKey(nota.course_name)
  if (!k) return []
  const hits: CursoMalla[] = []
  for (const p of programasDelAlumno) hits.push(...(idx.porProgNombre.get(`${p}|${k}`) ?? []))
  return [...new Map(hits.map(h => [h.id, h])).values()]
}

// Estado del intento, leído de la nota.
export type EstadoMatricula = 'no_iniciada' | 'en_curso' | 'aprobada' | 'reprobada' | 'retirada'

// El mínimo lo decide la CATEGORÍA del programa y se pasa desde fuera. La nota
// ya no lo guarda: el importador de Moodle lo dejó de escribir a propósito
// —"el mínimo no se guarda en la nota, es la regla de la categoría y se
// resuelve al leer"— así que caer a un 70 fijo juzgaba con vara de bachiller
// los programas de Master y Doctorado, donde son 80.
//
// Pasó: 45 matrículas quedaron 'aprobada' con notas de 65,6, 46 y hasta 1. No
// movía el precio —eso depende de estar registrado— pero sí los egresados y los
// carruseles, que leen estado y contaban como cubierta una asignatura
// reprobada. Es el mismo error que ya se corrigió en el acta y volvió a
// aparecer aquí: la categoría manda.
export function estadoDeNota(
  n: NotaMin & { source?: string | null; estado_academico?: string | null },
  minimoDeCategoria?: number | null,
): EstadoMatricula {
  if (n.withdrawn_at) return 'retirada'
  // Una fila de plan es una asignatura inscrita que nadie ha empezado. No es
  // "en curso": el estudiante no ha entrado al aula ni rendido nada, y llamarlo
  // en curso lo metería en los conteos de carga académica.
  if (String(n.source ?? '') === 'plan') return 'no_iniciada'
  // El estado calculado MANDA sobre comparar la nota contra el mínimo: un
  // acumulado de Moodle sobre el 100% del curso (57,83 con el aula a medias)
  // no es un reprobado sino alguien cursando. Es la tercera vez que este error
  // aparece —acta, luego aquí—: 595 matrículas quedaron 'reprobada' cursándose,
  // y el gestor de Re-Entry proponía un tercer intento de lo que el estudiante
  // ya estaba recursando (Samuel Tejada, 21/08/2026).
  const est = String(n.estado_academico ?? '')
  if (est === 'pendiente') return 'en_curso'
  if (est === 'aprobado') return 'aprobada'
  if (est === 'reprobado') return 'reprobada'
  const v = n.retake_grade ?? n.final_grade ?? null
  if (v == null) return 'en_curso'
  const min = minimoDeCategoria ?? n.passing_score ?? 70
  return Number(v) >= Number(min) ? 'aprobada' : 'reprobada'
}

// ---------------------------------------------------------------------------
// Abrir (o poner al día) la matrícula por asignatura de una nota importada.
//
// Existe porque el acta ya no pregunta "¿hay fila en notas?" sino "¿está en su
// registro?" (paso 2, 14-08-2026). Si el importador solo escribiera la nota, la
// asignatura quedaría fuera del acta y fuera del precio hasta que el cron
// nocturno reconstruyera el registro — horas después, y sin que nadie lo note.
//
// Es idempotente: la llave es (student_id, course_id, attempt), así que
// reimportar el aula no duplica. El estado se recalcula en cada pasada, que es
// lo que hace que "en curso" pase a "aprobada" cuando llega la nota.
//
// No decide el intento: se lo da quien llama, que es quien sabe si esta nota es
// el primer intento o un recursado.
// ---------------------------------------------------------------------------
export interface MatriculaDeNota {
  student_id: string
  document_number: string | null
  course_id: string
  program_id: string | null
  program_enrollment_id?: string | null
  attempt: number
  semester_id?: string | null
  term_year?: number | null
  term_block?: string | null
  status: EstadoMatricula
  source: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function asegurarMatriculas(sb: any, filas: MatriculaDeNota[], abiertoPor = 'importacion'): Promise<{ escritas: number; error?: string }> {
  if (!filas.length) return { escritas: 0 }
  // Una nota por asignatura e intento: si el aula trae dos veces al mismo
  // alumno, gana la última.
  const unicas = new Map<string, MatriculaDeNota>()
  for (const f of filas) unicas.set(`${f.student_id}|${f.course_id}|${f.attempt}`, f)
  const lote = [...unicas.values()].map(f => ({ ...f, opened_by: abiertoPor }))

  let escritas = 0
  for (let i = 0; i < lote.length; i += 400) {
    const { error } = await sb.from('academic_course_enrollments')
      .upsert(lote.slice(i, i + 400), { onConflict: 'student_id,course_id,attempt' })
    if (error) return { escritas, error: error.message }
    escritas += Math.min(400, lote.length - i)
  }
  return { escritas }
}

// ---------------------------------------------------------------------------
// Poner al día el estado de la matrícula tras editar una nota a mano.
//
// El editor manual corrige notas que ya existen, así que su matrícula también
// existe: aquí no falta la fila, se queda vieja. Corregir un 40 a 85 dejaba la
// nota aprobada y la matrícula diciendo 'reprobada' hasta el cron de las 4:45.
//
// No mueve el precio —eso depende de estar registrado, no del estado— pero sí
// los egresados y los carruseles, que leen estado. Y el que corrige una nota es
// justamente quien espera ver el efecto en el acto.
//
// Nunca lanza: la nota ya está guardada y auditada. Si esto falla, el cron
// nocturno converge igual.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sincronizarEstadoDeMatricula(sb: any, externalId: string): Promise<void> {
  try {
    const { data: nota } = await sb.from('academic_grades')
      .select('course_enrollment_id, final_grade, retake_grade, passing_score, source, withdrawn_at, estado_academico')
      .eq('external_id', externalId).maybeSingle()
    if (!nota?.course_enrollment_id) return

    const { data: mat } = await sb.from('academic_course_enrollments')
      .select('id, program_id, status').eq('id', nota.course_enrollment_id).maybeSingle()
    if (!mat) return

    // El estado sale de la MEJOR nota de la matrícula, no de la que llega.
    //
    // Antes se escribía con la nota recibida y punto. Como el importador llama
    // a esto por nota, en una asignatura con dos notas ganaba la última en
    // procesarse: a Heidy Mendoza un "1" heredado de SystemActiva le pisó un
    // 82,5 de Moodle y su matrícula quedó reprobada. El acta siempre se quedó
    // con la mejor; esto no lo hacía, y por eso las dos podían discrepar.
    const { data: hermanas } = await sb.from('academic_grades')
      .select('final_grade, retake_grade, passing_score, source, withdrawn_at, estado_academico')
      .eq('course_enrollment_id', mat.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activas = ((hermanas ?? []) as any[]).filter(n => !n.withdrawn_at)
    const conValor = activas.filter(n => (n.retake_grade ?? n.final_grade) != null)
    // Retirada solo si NO queda ninguna viva; si hay nota, manda la más alta;
    // si ninguna tiene nota todavía, cualquiera dice lo mismo: en curso.
    const manda = conValor.length
      ? conValor.reduce((a, b) => (Number(b.retake_grade ?? b.final_grade) > Number(a.retake_grade ?? a.final_grade) ? b : a))
      : (activas[0] ?? nota)

    // El mínimo es de la categoría del programa, no de la nota.
    let minimo: number | null = null
    if (mat.program_id) {
      const { data: prog } = await sb.from('academic_programs')
        .select('category:academic_programs_category(passing_score)').eq('id', mat.program_id).maybeSingle()
      minimo = prog?.category?.passing_score ?? null
    }
    const quiere = estadoDeNota(manda as never, minimo)
    if (quiere === mat.status) return
    await sb.from('academic_course_enrollments').update({ status: quiere }).eq('id', mat.id)
  } catch { /* el cron converge */ }
}

// Orden de los intentos de un mismo estudiante en una misma asignatura: por
// periodo y, a igualdad, por fecha de sincronización. El intento 1 es el más
// antiguo. SystemActiva ya lo modelaba así — hay estudiantes con la misma
// asignatura en 2022, 2024 y 2025.
export function ordenarIntentos(notas: NotaMin[]): NotaMin[] {
  return [...notas].sort((a, b) => {
    const ay = a.term_year ?? 9999, by = b.term_year ?? 9999
    if (ay !== by) return ay - by
    const ab = String(a.term_block ?? ''), bb = String(b.term_block ?? '')
    if (ab !== bb) return ab.localeCompare(bb)
    return String(a.synced_at ?? '').localeCompare(String(b.synced_at ?? ''))
  })
}

// ---------------------------------------------------------------------------
// Poner al día TODOS los estados del registro, de una pasada.
//
// El auditor decía que "el cron nocturno lo cura solo" y no era verdad: la
// reconstrucción nocturna crea las matrículas que faltan e ignora las que ya
// existen —ignoreDuplicates—, así que un estado viejo se quedaba viejo para
// siempre. El único que sincronizaba era el editor manual, nota a nota.
//
// Va en bloque a propósito: nota a nota son tres consultas por matrícula y
// 25.000 matrículas no caben en el tiempo de una función. Así son cinco
// lecturas y una escritura por estado distinto.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sincronizarTodosLosEstados(sb: any): Promise<{ revisadas: number; corregidas: number; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todas = async (tabla: string, cols: string, orden: string): Promise<any[]> => {
    const out: unknown[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(tabla).select(cols).order(orden).range(from, from + 999)
      if (error) throw new Error(`${tabla}: ${error.message}`)
      out.push(...(data ?? []))
      if ((data ?? []).length < 1000) break
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return out as any[]
  }
  try {
    const [notas, ce, progs, cats] = await Promise.all([
      todas('academic_grades', 'external_id, course_enrollment_id, withdrawn_at, final_grade, retake_grade, passing_score, source, estado_academico', 'external_id'),
      todas('academic_course_enrollments', 'id, program_id, status', 'id'),
      todas('academic_programs', 'id, category_id', 'id'),
      todas('academic_programs_category', 'id, passing_score', 'id'),
    ])
    const minCat = new Map<string, number | null>(cats.map(c => [String(c.id), c.passing_score]))
    const minProg = new Map<string, number | null>(progs.map(p => [String(p.id), minCat.get(String(p.category_id)) ?? null]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const porMatricula = new Map<string, any[]>()
    for (const n of notas) {
      if (!n.course_enrollment_id) continue
      const k = String(n.course_enrollment_id)
      if (!porMatricula.has(k)) porMatricula.set(k, [])
      porMatricula.get(k)!.push(n)
    }
    const porEstado = new Map<string, string[]>()
    let revisadas = 0
    for (const m of ce) {
      const hermanas = porMatricula.get(String(m.id))
      if (!hermanas?.length) continue
      revisadas++
      const activas = hermanas.filter(n => !n.withdrawn_at)
      const conValor = activas.filter(n => (n.retake_grade ?? n.final_grade) != null)
      const manda = conValor.length
        ? conValor.reduce((a, b) => (Number(b.retake_grade ?? b.final_grade) > Number(a.retake_grade ?? a.final_grade) ? b : a))
        : (activas[0] ?? hermanas[0])
      const quiere = estadoDeNota(manda as never, minProg.get(String(m.program_id)) ?? null)
      if (quiere === m.status) continue
      if (!porEstado.has(quiere)) porEstado.set(quiere, [])
      porEstado.get(quiere)!.push(String(m.id))
    }
    let corregidas = 0
    for (const [estado, ids] of porEstado) {
      for (let i = 0; i < ids.length; i += 200) {
        const trozo = ids.slice(i, i + 200)
        const { error } = await sb.from('academic_course_enrollments').update({ status: estado }).in('id', trozo)
        if (error) return { revisadas, corregidas, error: error.message }
        corregidas += trozo.length
      }
    }
    return { revisadas, corregidas }
  } catch (e) {
    return { revisadas: 0, corregidas: 0, error: e instanceof Error ? e.message : 'fallo al sincronizar estados' }
  }
}
