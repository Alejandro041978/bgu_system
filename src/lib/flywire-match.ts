// ---------------------------------------------------------------------------
// Pagos de Flywire que llegan SIN referencia de cuota.
//
// Son los que el pagador inicia en el portal de Flywire, no desde su estado de
// cuenta. Al mirarlos de cerca (10/08/2026) resultaron no ser estudiantes
// esquivando nuestro botón: de los cuatro primeros, TRES no existían todavía en
// el ERP. Son postulantes pagando su admisión — gente que por definición no
// tiene usuario, ni estado de cuenta, ni cuota que referenciar.
//
// Por eso el canal no se cierra. Lo que se hace es resolver solo lo que se
// puede resolver: cuando el documento del pagador corresponde a un estudiante
// nuestro, el pago se aplica a su cuota vencida más antigua —que es
// exactamente lo que hace una persona a mano— y en la bandeja queda únicamente
// lo que de verdad necesita una decisión: quien todavía no está en el ERP.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface Emparejamiento {
  ok: boolean
  charge_external_id?: string
  student_id?: string
  motivo: string
}

/** Documento con el que el pagador se identificó en el portal. */
export function documentoDe(fields: Record<string, unknown> | null | undefined): string | null {
  const f = fields ?? {}
  const v = String(f.dni ?? '').trim() || String(f.student_id ?? '').trim()
  // Se limpia lo que el pagador escribe a mano: espacios, puntos y guiones.
  const limpio = v.replace(/[\s.\-]/g, '')
  return limpio || null
}

/**
 * A qué cuota aplicar un pago sin referencia.
 *
 * La regla es la de Cobranzas: la vencida más antigua con saldo. Si no tiene
 * ninguna vencida, la más próxima a vencer. Si no debe nada, NO se inventa un
 * destino — se deja para que alguien decida, porque un pago sin deuda suele
 * significar que se adelantó a algo que aún no está facturado.
 */
export async function emparejarPorDocumento(
  sb: SB, fields: Record<string, unknown> | null | undefined, email?: string | null,
): Promise<Emparejamiento> {
  const doc = documentoDe(fields)
  const correo = String(email ?? (fields ?? {}).student_email ?? '').trim().toLowerCase()
  if (!doc && !correo) return { ok: false, motivo: 'el pago no trae documento ni correo' }

  const filtros: string[] = []
  if (doc) filtros.push(`document_number.eq.${doc}`)
  if (correo) filtros.push(`email.eq.${correo}`)
  const { data: studs } = await sb.from('academic_students')
    .select('id, first_name, last_name, document_number').or(filtros.join(',')).limit(2)

  if (!(studs ?? []).length) return { ok: false, motivo: `no hay ningún estudiante con el documento ${doc ?? correo}` }
  // Dos estudiantes distintos con ese dato es un problema de datos, no un pago
  // que podamos colocar: se deja para que lo miren.
  if ((studs ?? []).length > 1) return { ok: false, motivo: `${doc ?? correo} corresponde a más de un estudiante` }
  const stu = studs[0]

  const { data: cargos } = await sb.from('account_charges')
    .select('external_id, amount, due_date').eq('student_id', stu.id)
  if (!(cargos ?? []).length) return { ok: false, student_id: stu.id, motivo: 'el estudiante no tiene cuotas emitidas' }

  const ids = (cargos ?? []).map((c: { external_id: string }) => c.external_id)
  const { data: pagos } = await sb.from('account_payments').select('charge_external_id, amount').in('charge_external_id', ids)
  const pagado = new Map<string, number>()
  for (const p of pagos ?? []) pagado.set(p.charge_external_id, (pagado.get(p.charge_external_id) ?? 0) + Number(p.amount ?? 0))

  const hoy = new Date().toISOString().slice(0, 10)
  const conSaldo = (cargos ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => ({ ...c, saldo: Math.round((Number(c.amount ?? 0) - (pagado.get(c.external_id) ?? 0)) * 100) / 100 }))
    .filter((c: { saldo: number }) => c.saldo > 0.005)
  if (!conSaldo.length) return { ok: false, student_id: stu.id, motivo: 'el estudiante no debe nada: puede ser un adelanto' }

  const vencidas = conSaldo.filter((c: { due_date: string | null }) => c.due_date && c.due_date <= hoy)
  const orden = (a: { due_date: string | null }, b: { due_date: string | null }) =>
    String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999'))
  const destino = (vencidas.length ? vencidas : conSaldo).sort(orden)[0]

  return {
    ok: true, charge_external_id: destino.external_id, student_id: stu.id,
    motivo: `${stu.first_name} ${stu.last_name} · ${vencidas.length ? 'cuota vencida más antigua' : 'próxima cuota a vencer'}`,
  }
}
