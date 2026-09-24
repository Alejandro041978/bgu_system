// ---------------------------------------------------------------------------
// El PERIODO de una asignatura sale de CUÁNDO el estudiante rindió sus
// evaluaciones (decisión del usuario, 24/09/2026): Moodle devuelve, por cada
// quiz o trabajo de cada alumno, la nota y la fecha en que se calificó
// (gradedategraded). Un solo camino para fechar notas de Moodle — ni la
// oferta del aula, ni el semestre en curso, ni cargas a mano.
//
// Regla: el semestre donde caen MÁS evaluaciones calificadas; en empate, el
// más reciente. Es por estudiante, no por aula: un aula reutilizada por tres
// cohortes deja a cada alumno en el semestre en que rindió. Mientras la
// asignatura está en curso se recalcula en cada importación; al cerrarse, las
// fechas ya no cambian y el semestre queda fijo.
//
// Una fecha que cae en un hueco entre semestres (vacaciones) se atribuye al
// último semestre que ya había empezado. Sin ninguna evaluación calificada no
// hay periodo que afirmar: null, y el escritor conserva el que la nota tuviera.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface Semestre { id: string; name: string; start_date: string; end_date: string | null }

export async function cargarSemestres(sb: SB): Promise<Semestre[]> {
  const { data, error } = await sb.from('academic_semesters').select('id, name, start_date, end_date').order('start_date')
  if (error) throw new Error('academic_semesters: ' + error.message)
  return ((data ?? []) as Semestre[]).map(s => ({ ...s, id: String(s.id), start_date: String(s.start_date), end_date: s.end_date ? String(s.end_date) : null }))
}

export function semestreDeFecha(fecha: string, semestres: Semestre[]): Semestre | null {
  const f = fecha.slice(0, 10)
  return semestres.find(s => s.start_date <= f && (!s.end_date || f <= s.end_date))
    ?? [...semestres].reverse().find(s => s.start_date <= f)
    ?? null
}

// Resguardo (usuario, 24/09/2026): si TODAS las evaluaciones comparten una sola
// fecha y son 3 o más, no se rindieron ese día — son calificaciones migradas o
// restauradas en bloque (caso Franco Gonzales: 15 quizzes de 2023 fechados el
// 27/04/2026). No se afirma periodo: se conserva el que la nota tenga. Con 1 o
// 2 ítems una misma fecha sí puede ser real (dos quizzes el mismo día).
export const MIN_ITEMS_MIGRACION = 3
export function semestrePorEvaluaciones(fechas: (string | null | undefined)[], semestres: Semestre[]): Semestre | null {
  const validas = fechas.filter((f): f is string => !!f).map(f => String(f).slice(0, 10))
  if (validas.length >= MIN_ITEMS_MIGRACION && new Set(validas).size === 1) return null
  const votos = new Map<string, number>()
  for (const f of fechas) {
    if (!f) continue
    const s = semestreDeFecha(String(f), semestres)
    if (s) votos.set(s.id, (votos.get(s.id) ?? 0) + 1)
  }
  if (!votos.size) return null
  const porId = new Map(semestres.map(s => [s.id, s]))
  return [...votos.entries()]
    .map(([id, n]) => ({ s: porId.get(id)!, n }))
    .sort((a, b) => b.n - a.n || b.s.start_date.localeCompare(a.s.start_date))[0].s
}

// gradedategraded de Moodle viene en segundos epoch
export const fechaDeItem = (i: { gradedategraded?: number | string | null }): string | null =>
  i?.gradedategraded ? new Date(Number(i.gradedategraded) * 1000).toISOString().slice(0, 10) : null
