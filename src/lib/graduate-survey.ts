// ---------------------------------------------------------------------------
// Cuestionario de la Encuesta de Titulados (versión 1, 10/09/2026).
//
// Fiel al formulario de Google que definió Dirección, con una diferencia
// deliberada: nombre, año de graduación y programa NO se preguntan — el
// enlace es nominal (token por estudiante) y esos datos salen de la ficha,
// que además habilita los cruces (programa, categoría, país).
//
// Las claves (id) son estables: los resultados históricos se agregan por id,
// así que NO se renombran; si una pregunta cambia de fondo, se crea otra.
// ---------------------------------------------------------------------------

export type PreguntaTipo = 'choice' | 'multi' | 'likert' | 'texto'

export interface Pregunta {
  id: string
  tipo: PreguntaTipo
  seccion: string
  es: string
  en: string
  opciones?: { id: string; es: string; en: string }[]
  // Solo aparece (y se exige) cuando la situación laboral es con empleo
  soloEmpleado?: boolean
  requerida: boolean
}

export const SECCIONES: Record<string, { es: string; en: string }> = {
  s1: { es: 'Situación profesional actual', en: 'Current professional situation' },
  s2: { es: 'Experiencia educativa en Blackwell Global University', en: 'Educational experience at Blackwell Global University' },
  s3: { es: 'Habilidades y competencias adquiridas', en: 'Skills and competencies acquired' },
  s4: { es: 'Desarrollo profesional después de la graduación', en: 'Professional development after graduation' },
}

const likert = (id: string, seccion: string, es: string, en: string): Pregunta => ({
  id, tipo: 'likert', seccion, es, en, requerida: true,
})

export const PREGUNTAS: Pregunta[] = [
  {
    id: 'situacion_laboral', tipo: 'choice', seccion: 's1', requerida: true,
    es: '¿Cuál es su situación laboral actual?',
    en: 'What is your current employment status?',
    opciones: [
      { id: 'empleado_tc', es: 'Empleado/a tiempo completo', en: 'Full-time employee' },
      { id: 'empleado_tp', es: 'Empleado/a tiempo parcial', en: 'Part-time employee' },
      { id: 'independiente', es: 'Trabajador/a independiente', en: 'Self-employed' },
      { id: 'desempleado_buscando', es: 'Desempleado/a y en búsqueda de empleo', en: 'Unemployed and seeking employment' },
      { id: 'desempleado_no_buscando', es: 'Desempleado/a y no en búsqueda de empleo', en: 'Unemployed and not seeking employment' },
      { id: 'estudios', es: 'Continuación de estudios', en: 'Continuing studies' },
    ],
  },
  { id: 'empresa', tipo: 'texto', seccion: 's1', requerida: true, soloEmpleado: true, es: 'Nombre de la empresa', en: 'Company name' },
  { id: 'puesto', tipo: 'texto', seccion: 's1', requerida: true, soloEmpleado: true, es: 'Puesto / cargo', en: 'Position / role' },
  { id: 'jefe_nombre', tipo: 'texto', seccion: 's1', requerida: true, soloEmpleado: true, es: 'Nombre del jefe inmediato', en: 'Immediate supervisor name' },
  { id: 'jefe_numero', tipo: 'texto', seccion: 's1', requerida: true, soloEmpleado: true, es: 'Número del jefe inmediato', en: 'Immediate supervisor phone number' },

  likert('cargo_esperado', 's1', 'Mi cargo actual refleja el nivel de responsabilidad que esperaba después de graduarme.', 'My current position reflects the level of responsibility I expected after graduating.'),
  likert('industria_alineada', 's1', 'Estoy empleado/a en una industria que se alinea con mis metas profesionales.', 'I am employed in an industry that aligns with my professional goals.'),
  likert('trabajo_relacionado', 's1', 'Mi trabajo actual está relacionado con el título que obtuve en la institución.', 'My current job is related to the degree I earned at the institution.'),

  likert('satisfaccion_general', 's2', 'Estoy satisfecho/a con la calidad general de mi experiencia académica en la institución.', 'I am satisfied with the overall quality of my academic experience at the institution.'),
  likert('preparacion_campo', 's2', 'Mi programa académico me preparó bien para mi campo profesional actual.', 'My academic program prepared me well for my current professional field.'),
  likert('servicios_apoyo', 's2', 'Los servicios de apoyo (asesoría, tutoría, servicios profesionales, etc.) respondieron a mis necesidades como estudiante.', 'Support services (advising, tutoring, career services, etc.) met my needs as a student.'),
  likert('valor_desarrollo', 's2', 'La experiencia educativa que recibí aportó un valor significativo a mi desarrollo profesional y personal.', 'The educational experience I received added significant value to my professional and personal development.'),
  likert('aprendizaje_online', 's2', 'La experiencia de aprendizaje en línea/híbrida apoyó mi aprendizaje de manera efectiva.', 'The online/hybrid learning experience effectively supported my learning.'),
  likert('recomendaria', 's2', 'Recomendaría esta institución a otras personas.', 'I would recommend this institution to others.'),

  likert('uso_habilidades', 's3', 'Utilizo regularmente en mi trabajo actual las habilidades que adquirí con mi grado académico.', 'I regularly use the skills I acquired through my degree in my current job.'),
  likert('habilidades_relevantes', 's3', 'Las habilidades aprendidas y los conocimientos adquiridos en mi programa son relevantes para las exigencias de mi función actual.', 'The skills and knowledge acquired in my program are relevant to the demands of my current role.'),
  likert('enfasis_habilidades', 's3', 'Un mayor énfasis en ciertas habilidades durante mi programa me habría preparado mejor para mi carrera profesional.', 'A greater emphasis on certain skills during my program would have better prepared me for my professional career.'),
  likert('pensamiento_critico', 's3', 'Mi programa me proporcionó sólidas habilidades de pensamiento crítico y resolución de problemas.', 'My program provided me with strong critical thinking and problem-solving skills.'),
  likert('posicionamiento', 's3', 'Mi grado me ha posicionado favorablemente para futuras oportunidades de desarrollo profesional.', 'My degree has positioned me favorably for future professional development opportunities.'),

  likert('estudios_adicionales', 's4', 'He realizado o estoy realizando estudios adicionales desde mi graduación.', 'I have pursued or am pursuing additional studies since graduation.'),
  likert('decision_influida', 's4', 'Mi decisión de continuar estudios adicionales fue influenciada por mi experiencia en la institución.', 'My decision to pursue additional studies was influenced by my experience at the institution.'),
  likert('motivacion_continua', 's4', 'Mi programa académico me motivó a considerar el desarrollo profesional o académico continuo.', 'My academic program motivated me to consider continuous professional or academic development.'),
  likert('planes_futuros', 's4', 'Planeo realizar estudios adicionales u obtener nuevas credenciales en el futuro.', 'I plan to pursue additional studies or obtain new credentials in the future.'),
  likert('experiencia_recomendacion', 's4', 'Mi experiencia general como estudiante influye positivamente en mi disposición a recomendar la institución.', 'My overall experience as a student positively influences my willingness to recommend the institution.'),

  {
    id: 'mejoras_trayectoria', tipo: 'multi', seccion: 's4', requerida: true,
    es: 'Desde que culminó sus estudios, ¿ha experimentado alguna de las siguientes mejoras en su trayectoria profesional? (puede seleccionar más de una)',
    en: 'Since completing your studies, have you experienced any of the following improvements in your professional career? (select all that apply)',
    opciones: [
      { id: 'mejor_empleo', es: 'Conseguí un mejor empleo o ingresé a una organización reconocida.', en: 'I obtained a better job or joined a recognized organization.' },
      { id: 'mas_responsabilidades', es: 'Asumí nuevas o mayores responsabilidades profesionales.', en: 'I took on new or greater professional responsibilities.' },
      { id: 'mayor_ingreso', es: 'Obtuve un incremento en mis ingresos o remuneración.', en: 'I obtained an increase in my income or compensation.' },
      { id: 'empleo_relacionado', es: 'Conseguí un empleo relacionado con mi formación profesional.', en: 'I obtained a job related to my professional training.' },
      { id: 'emprendimiento', es: 'Inicié un emprendimiento o proyecto profesional propio.', en: 'I started my own venture or professional project.' },
      { id: 'nuevas_oportunidades', es: 'Accedí a nuevas oportunidades de desarrollo profesional.', en: 'I accessed new professional development opportunities.' },
      { id: 'ninguna', es: 'Ninguna de las anteriores.', en: 'None of the above.' },
    ],
  },
  {
    id: 'estudios_realizados', tipo: 'multi', seccion: 's4', requerida: false,
    es: 'Si ha realizado estudios adicionales después de graduarse, ¿qué tipo de programa realizó?',
    en: 'If you have pursued additional studies after graduating, what type of program did you complete?',
    opciones: [
      { id: 'especializacion', es: 'Programa de Especialización', en: 'Specialization program' },
      { id: 'diplomado', es: 'Diplomado', en: 'Diploma' },
      { id: 'certificado_posgrado', es: 'Certificado de posgrado', en: 'Graduate certificate' },
      { id: 'licenciatura', es: 'Licenciatura', en: "Bachelor's degree" },
      { id: 'maestria', es: 'Maestría', en: "Master's degree" },
      { id: 'doctorado', es: 'Doctorado', en: 'Doctorate' },
      { id: 'microcredencial', es: 'Microcredencial', en: 'Microcredential' },
    ],
  },
  {
    id: 'estudios_futuros', tipo: 'choice', seccion: 's4', requerida: false,
    es: 'Si planea continuar estudios adicionales en el futuro, ¿qué tipo de educación o credencial está considerando?',
    en: 'If you plan to continue additional studies in the future, what type of education or credential are you considering?',
    opciones: [
      { id: 'especializacion', es: 'Programa de Especialización', en: 'Specialization program' },
      { id: 'diplomado', es: 'Diplomado', en: 'Diploma' },
      { id: 'certificado_posgrado', es: 'Certificado de posgrado', en: 'Graduate certificate' },
      { id: 'licenciatura', es: 'Licenciatura', en: "Bachelor's degree" },
      { id: 'maestria', es: 'Maestría', en: "Master's degree" },
      { id: 'doctorado', es: 'Doctorado', en: 'Doctorate' },
      { id: 'microcredencial', es: 'Microcredencial', en: 'Microcredential' },
      { id: 'educacion_continua', es: 'Educación continua', en: 'Continuing education' },
      { id: 'licencia_profesional', es: 'Licencia profesional', en: 'Professional license' },
    ],
  },
]

export const EMPLEADO_IDS = new Set(['empleado_tc', 'empleado_tp', 'independiente'])

// Valida el paquete de respuestas contra el cuestionario. Devuelve el error
// legible o null.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validarRespuestas(answers: Record<string, any>): string | null {
  const situacion = answers['situacion_laboral']
  const empleado = EMPLEADO_IDS.has(String(situacion ?? ''))
  for (const p of PREGUNTAS) {
    const v = answers[p.id]
    const exigida = p.requerida && (!p.soloEmpleado || empleado)
    if (p.soloEmpleado && !empleado) continue
    if (exigida && (v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === ''))) {
      return `Falta responder: ${p.es}`
    }
    if (v == null) continue
    if (p.tipo === 'likert') {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 1 || n > 5) return `Respuesta inválida en: ${p.es}`
    }
    if (p.tipo === 'choice' && p.opciones && String(v).trim() !== '' && !p.opciones.some(o => o.id === v)) return `Opción inválida en: ${p.es}`
    if (p.tipo === 'multi') {
      if (!Array.isArray(v)) return `Respuesta inválida en: ${p.es}`
      if (p.opciones && v.some(x => !p.opciones!.some(o => o.id === x))) return `Opción inválida en: ${p.es}`
    }
    if (p.tipo === 'texto' && String(v).length > 300) return `Respuesta demasiado larga en: ${p.es}`
  }
  return null
}
