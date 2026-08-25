// ---------------------------------------------------------------------------
// Estado académico de una nota: aprobado, reprobado o pendiente.
//
// La nota de Moodle es un ACUMULADO, no un promedio: cada actividad aporta sus
// puntos al total de 100. Un estudiante que rindió un quiz de 3,33% con 100
// puntos tiene 3,33, no 100. Por eso una nota baja no significa que le vaya
// mal — significa que el curso va por la mitad.
//
// Y como el acumulado sólo sube, no hace falta ningún umbral arbitrario para
// decidir el estado; lo decide la aritmética:
//
//   · Acumuló el mínimo aprobatorio → APROBADO, aunque le falte rendir. Nada
//     de lo que venga después se lo puede quitar.
//   · Rindió todo (o su registro fue cerrado) y no llegó → REPROBADO.
//   · Cualquier otra cosa → PENDIENTE. Se sigue construyendo.
//
// El pendiente no es un defecto: es una asignatura empezada. Sirve para
// decirle a quien se fue "tienes cuatro asignaturas a medias, no arrancas de
// cero" en vez de "tienes cuatro reprobadas".
// ---------------------------------------------------------------------------

export type EstadoAcademico = 'aprobado' | 'reprobado' | 'pendiente'

// Bonos del campus: evaluaciones "Live Class Quiz" (regla institucional,
// 24/08/2026). En Moodle son EXTRA CREDIT bajo agregación Natural: suman hasta
// 5 puntos por encima del promedio sin entrar en la base del 100%. El web
// service NO trae la marca de extra credit —a un bono rendido le pone
// weightraw > 0, igual que a un ítem normal—, así que la identificación es por
// nombre: el mismo criterio con el que se convirtieron en Moodle.
export const esItemBono = (nombre: string | null | undefined): boolean =>
  /^\s*live\s*class\s*quiz/i.test(String(nombre ?? ''))

export interface ItemProceso {
  n?: number
  pct: number | null
  val: number | null
  desc?: string
  // Bono (extra credit): no pesa en el 100% — val son PUNTOS logrados (0–max),
  // no porcentaje. Queda fuera de rendido_pct y de la suma de pesos.
  extra?: boolean
  max?: number | null
}

// Cuánto del curso está efectivamente calificado, en porcentaje.
//
// Se mide sobre la PONDERACIÓN, no sobre el número de actividades: un aula con
// un foro de peso 0 que nadie contesta no puede impedir que el registro se
// complete. Si los ítems que suman el 100% están calificados, está completo.
export function rendidoPct(items: ItemProceso[] | null | undefined): number | null {
  // Los bonos no cuentan: son puntos extra, no parte del curso. Sin este
  // filtro, quien rindió todo menos los bonos jamás llegaría al 99.5% y su
  // registro no podría cerrarse. (El pct null ya los excluye; la marca extra
  // es el cinturón por si algún bono llegara con pct.)
  const con = (items ?? []).filter(i => !i?.extra && Number(i?.pct ?? 0) > 0)
  if (!con.length) return null
  const suma = con.reduce((s, i) => s + Number(i.pct), 0)
  if (suma <= 0) return null
  const rendido = con.filter(i => i.val != null).reduce((s, i) => s + Number(i.pct), 0)
  // Se normaliza contra la ponderación real del aula: si suma 98 en vez de
  // 100, haber rendido esos 98 es haber rendido todo.
  return Math.round((rendido * 100 / suma) * 100) / 100
}

export function estadoAcademico(args: {
  valor: number | null            // retake_grade ?? final_grade
  passing_score: number | null
  rendido_pct: number | null
  cerrado: boolean                // el registro fue cerrado (locked_at)
}): EstadoAcademico {
  const min = Number(args.passing_score ?? 70)
  if (args.valor != null && Number(args.valor) >= min) return 'aprobado'
  // Rindió todo, o alguien cerró el registro: lo que quedó en blanco vale 0.
  if (args.cerrado || (args.rendido_pct != null && args.rendido_pct >= 99.5)) return 'reprobado'
  return 'pendiente'
}

// ¿Este estudiante ya no puede alcanzar el mínimo aunque saque el máximo en
// todo lo que le falta? No es un estado oficial —todavía tiene derecho a
// rendir— pero es la señal para llamarlo ANTES y no después.
export function irrecuperable(args: {
  valor: number | null; passing_score: number | null; rendido_pct: number | null
}): boolean {
  if (args.valor == null || args.rendido_pct == null) return false
  const min = Number(args.passing_score ?? 70)
  const falta = Math.max(0, 100 - args.rendido_pct)
  return Number(args.valor) + falta < min
}

// ¿Cambió alguna nota del detalle? Se compara sólo el valor de cada ítem: que
// el profesor renombre una actividad o reordene el aula no es una evaluación
// nueva. Sirve para fechar la última vez que el estudiante fue calificado, que
// es el dato del que dependerán los cierres por inactividad.
export function huboEvaluacionNueva(
  antes: ItemProceso[] | null | undefined,
  ahora: ItemProceso[] | null | undefined,
): boolean {
  const clave = (is: ItemProceso[] | null | undefined) =>
    (is ?? []).map(i => `${String(i?.desc ?? '').trim()}=${i?.val ?? ''}`).sort().join('|')
  return clave(antes) !== clave(ahora)
}
