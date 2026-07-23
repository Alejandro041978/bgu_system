// ---------------------------------------------------------------------------
// Tarifario oficial por crédito (precios regulados).
// Resolución: tarifa del PROGRAMA si existe una vigente; si no, la de su
// CATEGORÍA. "Vigente" = la de effective_from más reciente que no supere la
// fecha consultada. Los precios no se editan: se publican versiones nuevas.
// ---------------------------------------------------------------------------

export interface ResolvedRate {
  rate: number
  currency: string
  source: 'programa' | 'categoria'
  effective_from: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveCreditRate(sb: any, programId: string, onDate?: string): Promise<ResolvedRate | null> {
  const fecha = onDate ?? new Date().toISOString().slice(0, 10)

  const { data: prog } = await sb.from('academic_programs')
    .select('category_id').eq('id', programId).maybeSingle()

  const { data: byProg } = await sb.from('credit_rates')
    .select('price_per_credit, currency, effective_from')
    .eq('program_id', programId).lte('effective_from', fecha)
    .order('effective_from', { ascending: false }).limit(1).maybeSingle()
  if (byProg) return { rate: Number(byProg.price_per_credit), currency: byProg.currency, source: 'programa', effective_from: byProg.effective_from }

  if (prog?.category_id) {
    const { data: byCat } = await sb.from('credit_rates')
      .select('price_per_credit, currency, effective_from')
      .eq('category_id', prog.category_id).lte('effective_from', fecha)
      .order('effective_from', { ascending: false }).limit(1).maybeSingle()
    if (byCat) return { rate: Number(byCat.price_per_credit), currency: byCat.currency, source: 'categoria', effective_from: byCat.effective_from }
  }
  return null
}

// Congela la tarifa vigente en la matrícula (snapshot): tarifa, origen y
// precio de lista (tarifa × créditos del programa). No pisa un snapshot ya
// tomado — el precio del estudiante es el de su fecha de matrícula.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function snapshotCreditRate(sb: any, enrollmentId: string, programId: string, onDate?: string): Promise<void> {
  try {
    const { data: enr } = await sb.from('academic_student_enrollments')
      .select('credit_rate').eq('id', enrollmentId).maybeSingle()
    if (enr?.credit_rate != null) return

    const resolved = await resolveCreditRate(sb, programId, onDate)
    if (!resolved) return

    const { data: courses } = await sb.from('academic_courses').select('credits').eq('program_id', programId)
    const totalCredits = (courses ?? []).reduce((s: number, c: { credits: number | null }) => s + Number(c.credits ?? 0), 0)

    await sb.from('academic_student_enrollments').update({
      credit_rate: resolved.rate,
      credit_rate_source: resolved.source,
      list_price: totalCredits > 0 ? Math.round(resolved.rate * totalCredits * 100) / 100 : null,
    }).eq('id', enrollmentId)
  } catch { /* tarifario aún sin migrar o sin tarifas: la matrícula no se bloquea */ }
}
