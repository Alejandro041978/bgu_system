// ---------------------------------------------------------------------------
// Cuestionario de la Encuesta a Empleadores (versión 1, 11/09/2026).
//
// Fiel al formulario de Google "Employer Survey" de Dirección, con la misma
// diferencia deliberada que la encuesta de titulados: la identificación NO se
// pregunta — el token es nominal al empleador, y el nombre del graduado, su
// cargo, el nombre y el número del empleador ya viven en la base (los dio el
// propio titulado). El correo del empleador tampoco se pide (el canal es
// WhatsApp). Solo responde: modalidad + 8 de escala + 3 abiertas.
//
// La escala NO es acuerdo/desacuerdo (como en titulados) sino EXPECTATIVAS:
// 1 = No cumple las expectativas · 5 = Supera las expectativas.
//
// Las claves (id) son estables: los resultados históricos se agregan por id,
// así que NO se renombran; si una pregunta cambia de fondo, se crea otra.
// ---------------------------------------------------------------------------

export type PreguntaEmpleadorTipo = 'choice' | 'likert' | 'parrafo'

export interface PreguntaEmpleador {
  id: string
  tipo: PreguntaEmpleadorTipo
  es: string
  en: string
  opciones?: { id: string; es: string; en: string }[]
  requerida: boolean
}

export const ESCALA_EMPLEADOR: Record<string, { es: string; en: string }> = {
  '5': { es: 'Supera las expectativas', en: 'Exceeds expectations' },
  '4': { es: 'Con frecuencia supera las expectativas', en: 'Frequently exceeds expectations' },
  '3': { es: 'Cumple las expectativas', en: 'Meets expectations' },
  '2': { es: 'A veces cumple las expectativas', en: 'Sometimes meets expectations' },
  '1': { es: 'No cumple las expectativas', en: 'Does not meet expectations' },
}

const likert = (id: string, es: string, en: string, requerida = true): PreguntaEmpleador => ({
  id, tipo: 'likert', es, en, requerida,
})

export const PREGUNTAS_EMPLEADOR: PreguntaEmpleador[] = [
  {
    id: 'modalidad', tipo: 'choice', requerida: true,
    es: 'Modalidad de trabajo',
    en: 'Work mode',
    opciones: [
      { id: 'remoto', es: 'Remoto', en: 'Remote' },
      { id: 'presencial', es: 'Presencial', en: 'In-person' },
    ],
  },
  likert('habilidades_adecuadas', '¿Las habilidades del empleado son adecuadas para el puesto?', 'Are the employee’s skills adequate for the position?'),
  likert('sigue_instrucciones', '¿El empleado escucha y sigue bien las instrucciones?', 'Does the employee listen to and follow instructions well?'),
  likert('relacion_clientes', '¿El empleado se relaciona adecuadamente con los clientes y el público?', 'Does the employee relate appropriately to customers and the public?', false),
  likert('relacion_companeros', '¿El empleado se relaciona adecuadamente con sus compañeros de trabajo?', 'Does the employee relate appropriately to their coworkers?'),
  likert('relacion_gerencia', '¿El empleado se relaciona adecuadamente con la gerencia?', 'Does the employee relate appropriately to management?'),
  likert('acepta_retroalimentacion', '¿El empleado acepta bien la retroalimentación constructiva?', 'Does the employee accept constructive feedback well?'),
  likert('cumple_normas', 'El graduado cumple con las normas y responsabilidades laborales de la organización, incluyendo puntualidad, políticas internas y conducta profesional.', 'The graduate complies with the organization’s workplace standards and responsibilities, including punctuality, internal policies, and professional conduct.'),
  likert('actitud_positiva', '¿El empleado demuestra una actitud positiva en sus interacciones diarias?', 'Does the employee demonstrate a positive attitude in their daily interactions?'),
  { id: 'fortalezas', tipo: 'parrafo', requerida: true, es: '¿Cuáles son las fortalezas del empleado en el trabajo?', en: 'What are the employee’s strengths at work?' },
  { id: 'debilidades', tipo: 'parrafo', requerida: true, es: '¿Cuáles son las debilidades del empleado en el trabajo?', en: 'What are the employee’s weaknesses at work?' },
  { id: 'cursos_faltantes', tipo: 'parrafo', requerida: true, es: '¿Qué habilidades adicionales o cursos debería haber adquirido o llevado el empleado?', en: 'What additional skills or courses should the employee have acquired or taken?' },
]

// Valida el paquete de respuestas contra el cuestionario. Devuelve el error
// legible o null.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validarRespuestasEmpleador(answers: Record<string, any>): string | null {
  for (const p of PREGUNTAS_EMPLEADOR) {
    const v = answers[p.id]
    if (p.requerida && (v == null || String(v).trim() === '')) return `Falta responder: ${p.es}`
    if (v == null || String(v).trim() === '') continue
    if (p.tipo === 'likert') {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 1 || n > 5) return `Respuesta inválida en: ${p.es}`
    }
    if (p.tipo === 'choice' && p.opciones && !p.opciones.some(o => o.id === v)) return `Opción inválida en: ${p.es}`
    if (p.tipo === 'parrafo' && String(v).length > 2000) return `Respuesta demasiado larga en: ${p.es}`
  }
  return null
}
