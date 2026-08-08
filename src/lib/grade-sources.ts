// ---------------------------------------------------------------------------
// Qué filas de academic_grades son un INTENTO del estudiante y cuáles no.
//
// La tabla guarda tres cosas distintas bajo el mismo techo:
//   'convalidacion' / 'validacion' → el reconocimiento vive en transfer_credits;
//        estas filas son un espejo y se resuelven aparte.
//   'plan'  → la asignatura está en su registro curricular porque pertenece a
//        su malla, pero todavía no la ha empezado. Sin nota, sin aula, sin
//        periodo. Existe para que el registro de un matriculado esté completo.
//   el resto ('systemactiva', 'moodle', 'csv', manual) → intentos reales.
//
// La distinción importa porque casi todo el ERP lee "fila sin nota" como
// "cursando ahora": el acta la cuenta como en proceso, y de ahí sale el precio
// oficial. Si las 1.930 asignaturas que a los bachilleres les faltan por
// inscribir entraran como en proceso, a cada uno le subiría el Total Tuition
// por asignaturas que nadie ha empezado.
//
// Por eso el filtro está aquí y no repetido en trece archivos: quien consulta
// notas usa esIntento/sinPlan y no tiene que acordarse de la regla.
// ---------------------------------------------------------------------------

export const FUENTE_PLAN = 'plan'

const NO_SON_INTENTO = new Set(['convalidacion', 'validacion', FUENTE_PLAN])

export function esIntento(g: { source?: string | null }): boolean {
  return !NO_SON_INTENTO.has(String(g?.source ?? ''))
}

export function esFilaDePlan(g: { source?: string | null }): boolean {
  return String(g?.source ?? '') === FUENTE_PLAN
}

// Para las consultas: .from('academic_grades').select(…) → soloIntentos(q)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function soloIntentos<T>(q: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let out: any = q
  for (const s of NO_SON_INTENTO) out = out.neq('source', s)
  return out as T
}
