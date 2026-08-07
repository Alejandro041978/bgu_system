// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

// Plantillas de facturación v2: se definen por PROGRAMA o CATEGORÍA, y la fecha
// de la primera cuota se CALCULA a partir del inicio de clases.
//
// El modelo viejo ataba cada plantilla a un par (programa, convocatoria) y
// guardaba la fecha a mano. Eso obligaba a crear una plantilla nueva por cada
// llamado —345 pares tenían estudiantes y ninguna— cuando lo único que
// cambiaba entre convocatorias era esa fecha.

export const DIAS_DE_GRACIA = 20

/**
 * Primera cuota = día 1 del mes SIGUIENTE a (inicio de clases + 20 días).
 *
 *   18 de abril      → 8 de mayo       → 1 de junio
 *   4 de noviembre   → 24 de noviembre → 1 de diciembre
 *
 * Los 20 días son el margen para que el estudiante empiece a cursar antes de
 * que le venza nada; el salto al día 1 hace que todas las cuotas caigan el
 * mismo día del mes, que es como se cobra.
 */
export function primeraCuota(inicioClases: string | Date): string {
  const base = typeof inicioClases === 'string'
    ? new Date(inicioClases.slice(0, 10) + 'T12:00:00')
    : new Date(inicioClases)
  const d = new Date(base)
  d.setDate(d.getDate() + DIAS_DE_GRACIA)
  // Día 1 del mes siguiente al que cayó. Si cayera exactamente en un día 1, el
  // "siguiente" sigue siendo el mes que viene: una cuota no vence el mismo día
  // en que se cumple el plazo de gracia.
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 10)
}

/** Vencimiento de la cuota i (0-based): siempre el día 1, mes a mes. */
export function vencimientoCuota(primera: string, i: number): string {
  const p = new Date(primera.slice(0, 10) + 'T12:00:00')
  return new Date(Date.UTC(p.getFullYear(), p.getMonth() + i, 1)).toISOString().slice(0, 10)
}

export interface Plantilla {
  id: string
  name: string
  currency: string
  registration_fee: number
  registration_concept: number | null
  installments_count: number
  installment_amount: number
  installment_concept: number | null
  origen: 'coleccion' | 'programa' | 'categoria'
}

/**
 * La plantilla que le toca a una matrícula. Gana la más específica que exista:
 *
 *   COLECCIÓN → PROGRAMA → CATEGORÍA
 *
 * La colección es la variante que el estudiante cursa de verdad —idioma, campus
 * socio—, y ahí el precio sí puede cambiar: un socio externo no cobra lo mismo.
 * El programa es el caso habitual y la categoría el general, que cubre decenas
 * de programas de una vez. Mismo criterio que el tarifario de precios regulados.
 */
export async function plantillaDe(sb: SB, programId: string, collectionId?: string | null): Promise<Plantilla | null> {
  const { data: prog } = await sb.from('academic_programs')
    .select('id, category_id').eq('id', programId).maybeSingle()
  if (!prog) return null

  const pick = async (col: 'collection_id' | 'program_id' | 'category_id', val: string): Promise<Plantilla | null> => {
    const { data } = await sb.from('billing_template_targets')
      .select('billing_templates(*)').eq(col, val).maybeSingle()
    const t = data?.billing_templates
    if (!t || t.active === false) return null
    return {
      id: t.id, name: t.name, currency: t.currency,
      registration_fee: Number(t.registration_fee ?? 0),
      registration_concept: t.registration_concept ?? null,
      installments_count: Number(t.installments_count ?? 0),
      installment_amount: Number(t.installment_amount ?? 0),
      installment_concept: t.installment_concept ?? null,
      origen: col === 'collection_id' ? 'coleccion' : col === 'program_id' ? 'programa' : 'categoria',
    }
  }

  return (collectionId ? await pick('collection_id', collectionId) : null)
    ?? (await pick('program_id', programId))
    ?? (prog.category_id ? await pick('category_id', prog.category_id) : null)
}

/** Inicio de clases de la convocatoria. Sin él no hay de dónde calcular fechas. */
export async function inicioDeClases(sb: SB, convocatoriaId: string | null): Promise<string | null> {
  if (!convocatoriaId) return null
  const { data } = await sb.from('convocatorias')
    .select('first_day').eq('id', convocatoriaId).maybeSingle()
  return data?.first_day ? String(data.first_day).slice(0, 10) : null
}
