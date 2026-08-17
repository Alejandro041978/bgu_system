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

// ---------------------------------------------------------------------------
// Rellenar la tarifa de las matrículas que se quedaron sin ella.
//
// snapshotCreditRate solo corre al CREAR la matrícula, y si en ese momento no
// había tarifa publicada sale sin escribir nada y no vuelve a intentarlo. Así
// que publicar el tarifario de un programa nuevo no alcanzaba a nadie: las
// matrículas anteriores se quedaban sin precio oficial para siempre.
//
// Pasó con Continuing Education el 17-08-2026. Las tarifas de Bachelor y
// Master se publicaron el 23 de julio y por eso sus estados de cuenta
// mostraban el precio; las de DCE se publicaron hoy y 824 matrículas seguían
// en blanco. La fila decía "rige desde 2024-01-01", pero lo que importaba era
// que la fila no existía cuando se matricularon.
//
// El relleno usa la fecha de matrícula de cada uno, no la de hoy: cada
// estudiante recibe la tarifa que regía cuando entró, que es lo que el
// snapshot pretende desde el principio. Y nunca pisa una tarifa ya congelada.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function rellenarTarifasFaltantes(sb: any): Promise<{ rellenadas: number; sin_tarifa: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todas = async (t: string, cols: string): Promise<any[]> => {
    const out: unknown[] = []
    for (let f = 0; ; f += 1000) {
      const { data, error } = await sb.from(t).select(cols).order('id').range(f, f + 999)
      if (error) throw new Error(`${t}: ${error.message}`)
      out.push(...(data ?? []))
      if ((data ?? []).length < 1000) break
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return out as any[]
  }
  const hoy = new Date().toISOString().slice(0, 10)
  const [enr, progs, rates, cursos] = await Promise.all([
    todas('academic_student_enrollments', 'id, program_id, credit_rate, enrollment_date'),
    todas('academic_programs', 'id, category_id'),
    todas('credit_rates', 'program_id, category_id, price_per_credit, effective_from'),
    todas('academic_courses', 'program_id, credits'),
  ])
  const catDe = new Map<string, string | null>(progs.map(p => [String(p.id), p.category_id ? String(p.category_id) : null]))
  const creditos = new Map<string, number>()
  for (const c of cursos) {
    if (!c.program_id) continue
    creditos.set(String(c.program_id), (creditos.get(String(c.program_id)) ?? 0) + Number(c.credits ?? 0))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const porPrograma = new Map<string, any[]>(), porCategoria = new Map<string, any[]>()
  for (const r of rates) {
    if (r.program_id) {
      const k = String(r.program_id)
      if (!porPrograma.has(k)) porPrograma.set(k, [])
      porPrograma.get(k)!.push(r)
    } else if (r.category_id) {
      const k = String(r.category_id)
      if (!porCategoria.has(k)) porCategoria.set(k, [])
      porCategoria.get(k)!.push(r)
    }
  }
  // Misma regla que resolveCreditRate: el programa manda sobre la categoría, y
  // de las vigentes gana la de effective_from más reciente que no supere la
  // fecha. Se resuelve en memoria porque son cientos de matrículas y una
  // consulta por cada una no cabe en el tiempo de una función.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elegir = (lista: any[], fecha: string) => lista
    .filter(r => String(r.effective_from) <= fecha)
    .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0]

  const plan = new Map<string, string[]>()
  let sinTarifa = 0
  for (const e of enr) {
    if (e.credit_rate != null || !e.program_id) continue
    const fecha = e.enrollment_date ? String(e.enrollment_date).slice(0, 10) : hoy
    const pid = String(e.program_id)
    const cat = catDe.get(pid)
    const r = elegir(porPrograma.get(pid) ?? [], fecha)
      ?? (cat ? elegir(porCategoria.get(cat) ?? [], fecha) : undefined)
    if (!r) { sinTarifa++; continue }
    const source = (porPrograma.get(pid) ?? []).includes(r) ? 'programa' : 'categoria'
    const cr = creditos.get(pid) ?? 0
    const lista = cr > 0 ? Math.round(Number(r.price_per_credit) * cr * 100) / 100 : null
    const k = `${r.price_per_credit}|${source}|${lista ?? ''}`
    if (!plan.has(k)) plan.set(k, [])
    plan.get(k)!.push(String(e.id))
  }
  let rellenadas = 0
  for (const [k, ids] of plan) {
    const [rate, source, lista] = k.split('|')
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await sb.from('academic_student_enrollments')
        .update({ credit_rate: Number(rate), credit_rate_source: source, list_price: lista === '' ? null : Number(lista) })
        .in('id', ids.slice(i, i + 100))
      if (error) throw new Error(error.message)
      rellenadas += Math.min(100, ids.length - i)
    }
  }
  return { rellenadas, sin_tarifa: sinTarifa }
}
