// ---------------------------------------------------------------------------
// Semestre EN CURSO a una fecha: el que la contiene por start_date/end_date; si
// ninguno la contiene (hueco entre semestres), el último que ya empezó.
//
// Red de seguridad del importador (decisión del usuario, 24/09/2026): 322 de
// 549 aulas sincronizadas no tienen oferta de semestre, y toda nota nueva de
// ellas nacía "sin periodo". Lo correcto sigue siendo cargar la oferta en
// Cronogramas — el semestre en curso es solo el mejor dato disponible cuando
// no hay ninguno, y se sella con nota de que fue por respaldo.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any
export async function semestreEnCurso(sb: SB, fecha = new Date().toISOString().slice(0, 10)): Promise<{ id: string; name: string; start_date: string } | null> {
  const { data } = await sb.from('academic_semesters').select('id, name, start_date, end_date').order('start_date')
  const lista = ((data ?? []) as { id: string; name: string; start_date: string; end_date: string | null }[])
  const dentro = lista.find(s => String(s.start_date) <= fecha && (!s.end_date || fecha <= String(s.end_date)))
  const ultimo = [...lista].reverse().find(s => String(s.start_date) <= fecha)
  const s = dentro ?? ultimo ?? null
  return s ? { id: String(s.id), name: s.name, start_date: String(s.start_date) } : null
}
