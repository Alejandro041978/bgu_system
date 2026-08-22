// ---------------------------------------------------------------------------
// Créditos facturables EN BLOQUE: el mismo número que el estado de cuenta
// calcula para una matrícula (creditosQueLleva + creditosExtraPorIntentos),
// pero para muchas matrículas con un puñado de consultas en vez de seis por
// estudiante. Lo usan el auditor de tuition, las becas y los bonos: todo lo
// que muestre un "precio oficial" tiene que dar el mismo número que el estado
// de cuenta, y el snapshot list_price de la matrícula ya no sirve para eso
// (quedó congelado en la fecha de ingreso; a Zelada le decía $3.456 y su
// registro vale $24.192 — la beca salía en $0, 22/08/2026).
//
// Regla: lista = tarifa congelada × (créditos de la malla que están en su
// registro —matrícula viva o convalidación— + intentos extra de recursado).
// Sin nada en el registro, 0 créditos: cero de tuition, igual que el estado
// de cuenta.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface CreditosFacturables {
  creditos: number
  sinRegistro: boolean
  // tarifa × créditos (null si la matrícula no tiene tarifa ni programa)
  lista: number | null
  // créditos convalidados en el programa (para el ahorro TC)
  creditosTC: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: SB, t: string, cols: string, filtro?: (q: any) => any, orden = 'id'): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(t).select(cols)
    if (filtro) q = filtro(q)
    const { data, error } = await q.order(orden).range(from, from + 999)
    if (error) throw new Error(`${t}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todoIn(sb: SB, t: string, cols: string, col: string, ids: string[], orden = 'id'): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const lote = ids.slice(i, i + 150)
    out.push(...await todo(sb, t, cols, q => q.in(col, lote), orden))
  }
  return out
}

const r2 = (n: number) => Math.round(n * 100) / 100

// Calcula para las matrículas indicadas (o todas si no se pasan ids).
export async function creditosFacturablesEnBloque(sb: SB, enrollmentIds?: string[]): Promise<Map<string, CreditosFacturables>> {
  const enrs = enrollmentIds
    ? await todoIn(sb, 'academic_student_enrollments', 'id, student_id, program_id, credit_rate', 'id', enrollmentIds)
    : await todo(sb, 'academic_student_enrollments', 'id, student_id, program_id, credit_rate')
  const studentIds = [...new Set(enrs.map(e => String(e.student_id)))]
  const porEstudiante = !!enrollmentIds
  const [cursos, matriculas, tcs] = await Promise.all([
    todo(sb, 'academic_courses', 'id, program_id, credits'),
    porEstudiante
      ? todoIn(sb, 'academic_course_enrollments', 'student_id, course_id, program_id, status', 'student_id', studentIds)
      : todo(sb, 'academic_course_enrollments', 'id, student_id, course_id, program_id, status'),
    porEstudiante
      ? todoIn(sb, 'transfer_credits', 'id, student_id, dest_program_id, status', 'student_id', studentIds)
      : todo(sb, 'transfer_credits', 'id, student_id, dest_program_id, status'),
  ])
  const tcVivos = tcs.filter(t => t.status === 'active')
  const items = tcVivos.length
    ? await todoIn(sb, 'transfer_credit_items', 'transfer_credit_id, dest_course_id', 'transfer_credit_id', tcVivos.map(t => String(t.id)))
    : []

  const creditoDeCurso = new Map<string, number>()
  const mallaDePrograma = new Map<string, string[]>()
  for (const c of cursos) {
    creditoDeCurso.set(String(c.id), Number(c.credits ?? 0))
    if (c.program_id) mallaDePrograma.set(String(c.program_id), [...(mallaDePrograma.get(String(c.program_id)) ?? []), String(c.id)])
  }
  const vivasDe = new Map<string, { course_id: string; program_id: string | null }[]>()
  for (const m of matriculas) {
    if (m.status === 'retirada' || !m.course_id) continue
    const k = String(m.student_id)
    vivasDe.set(k, [...(vivasDe.get(k) ?? []), { course_id: String(m.course_id), program_id: m.program_id ? String(m.program_id) : null }])
  }
  const tcDe = new Map(tcVivos.map(t => [String(t.id), t]))
  const convDe = new Map<string, Set<string>>()   // student|program → dest_course_ids
  for (const it of items) {
    const t = tcDe.get(String(it.transfer_credit_id))
    if (!t?.student_id || !t?.dest_program_id || !it.dest_course_id) continue
    const k = `${t.student_id}|${t.dest_program_id}`
    if (!convDe.has(k)) convDe.set(k, new Set())
    convDe.get(k)!.add(String(it.dest_course_id))
  }

  const out = new Map<string, CreditosFacturables>()
  for (const e of enrs) {
    const sid = String(e.student_id), pid = e.program_id ? String(e.program_id) : null
    if (!pid) { out.set(String(e.id), { creditos: 0, sinRegistro: true, lista: null, creditosTC: 0 }); continue }
    const vivas = vivasDe.get(sid) ?? []
    const registradas = new Set(vivas.map(v => v.course_id))
    const conv = convDe.get(`${sid}|${pid}`) ?? new Set<string>()
    let total = 0, creditosTC = 0
    for (const cid of mallaDePrograma.get(pid) ?? []) {
      if (registradas.has(cid) || conv.has(cid)) total += creditoDeCurso.get(cid) ?? 0
      if (conv.has(cid)) creditosTC += creditoDeCurso.get(cid) ?? 0
    }
    const porCurso = new Map<string, number>()
    for (const v of vivas) {
      if (v.program_id != null && v.program_id !== pid) continue
      porCurso.set(v.course_id, (porCurso.get(v.course_id) ?? 0) + 1)
    }
    for (const [cid, n] of porCurso) if (n > 1) total += (n - 1) * (creditoDeCurso.get(cid) ?? 0)
    const rate = e.credit_rate != null ? Number(e.credit_rate) : null
    out.set(String(e.id), {
      creditos: total, sinRegistro: !vivas.length && !conv.size,
      lista: rate != null ? r2(rate * total) : null, creditosTC,
    })
  }
  return out
}
