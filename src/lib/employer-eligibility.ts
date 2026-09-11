import { EMPLEADO_IDS } from './graduate-survey'

// ---------------------------------------------------------------------------
// Elegibles de la Encuesta a Empleadores (11/09/2026).
//
// El elegible NO es un estudiante: es el EMPLEADOR (jefe inmediato), y por eso
// esta campaña no pasa por el resolver — le robaría al titulado su cupo en las
// campañas que sí son para él (cobranza, cashpay...). La identidad del
// empleador es su número E.164; regla del usuario: si varios titulados
// comparten empleador, UNA encuesta completada por año académico cubre a todos
// los asociados.
//
// La fuente es la encuesta de titulados del AÑO ACADÉMICO VIGENTE: en cuanto
// un titulado la completa declarando empleo (con jefe y WhatsApp válidos), su
// empleador se vuelve elegible — el dato fresco es el momento de contactar
// (decisión del usuario, 11/09/2026).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface TituladoDeEmpleador {
  student_id: string
  graduate_survey_id: string
  position: string | null
}

export interface EmpleadorElegible {
  phone: string
  name: string | null
  company: string | null
  language: string
  titulados: TituladoDeEmpleador[]
  // El más reciente en nombrarlo: su nombre personaliza la invitación
  primary_student_id: string
  // Fila de employer_surveys de este año, si ya existe
  survey: { id: string; completed_at: string | null; invited_count: number; last_invited_at: string | null } | null
}

export const TELEFONO_E164 = /^\+\d{7,15}$/

export async function empleadoresDelAnio(sb: SB): Promise<{
  anio: { id: string; start_date: string; end_date: string } | null
  empleadores: EmpleadorElegible[]
}> {
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: anio } = await sb.from('academic_years')
    .select('id, start_date, end_date').lte('start_date', hoy).gte('end_date', hoy)
    .limit(1).maybeSingle()
  if (!anio) return { anio: null, empleadores: [] }

  // Encuestas de titulados COMPLETADAS este año con empleo y jefe contactable
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completadas: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from('graduate_surveys')
      .select('id, student_id, language, completed_at, answers')
      .eq('academic_year_id', anio.id).not('completed_at', 'is', null)
      .order('completed_at', { ascending: true }).range(f, f + 999)
    if (error) return { anio, empleadores: [] }  // tabla ausente: sin elegibles
    completadas.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }

  const porTelefono = new Map<string, EmpleadorElegible>()
  for (const g of completadas) {
    const a = g.answers ?? {}
    if (!EMPLEADO_IDS.has(String(a.situacion_laboral ?? ''))) continue
    const tel = String(a.jefe_numero ?? '').trim()
    if (!TELEFONO_E164.test(tel)) continue
    const titulado: TituladoDeEmpleador = {
      student_id: String(g.student_id), graduate_survey_id: String(g.id),
      position: a.puesto ? String(a.puesto) : null,
    }
    const previo = porTelefono.get(tel)
    if (previo) {
      if (!previo.titulados.some(t => t.student_id === titulado.student_id)) previo.titulados.push(titulado)
      // Las completadas vienen ordenadas ascendente: la última en nombrar al
      // jefe define el dato más fresco (nombre, empresa, idioma, primario).
      previo.name = a.jefe_nombre ? String(a.jefe_nombre) : previo.name
      previo.company = a.empresa ? String(a.empresa) : previo.company
      previo.language = g.language === 'en' ? 'en' : 'es'
      previo.primary_student_id = titulado.student_id
    } else {
      porTelefono.set(tel, {
        phone: tel,
        name: a.jefe_nombre ? String(a.jefe_nombre) : null,
        company: a.empresa ? String(a.empresa) : null,
        language: g.language === 'en' ? 'en' : 'es',
        titulados: [titulado],
        primary_student_id: titulado.student_id,
        survey: null,
      })
    }
  }

  // Filas de employer_surveys ya creadas para este año
  try {
    const { data: filas } = await sb.from('employer_surveys')
      .select('id, employer_phone, completed_at, invited_count, last_invited_at')
      .eq('academic_year_id', anio.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const f of (filas ?? []) as any[]) {
      const e = porTelefono.get(String(f.employer_phone))
      if (e) e.survey = { id: String(f.id), completed_at: f.completed_at, invited_count: Number(f.invited_count ?? 0), last_invited_at: f.last_invited_at }
    }
  } catch { /* tabla ausente (migración sin correr): se comporta como sin filas */ }

  return { anio, empleadores: [...porTelefono.values()] }
}
