// ---------------------------------------------------------------------------
// ¿Está en el ERP todo lo que Flywire mandó, y por el importe exacto?
//
// Esa es la única pregunta. Lo que ocurra DESPUÉS —que el giro no llegue a
// cubrir la cuota, que sobre y haya que devolver, que se reparta entre varias—
// es trabajo de Cobranzas y no se observa aquí (regla del usuario,
// 18-08-2026). El ERP solo responde de que el dinero esté registrado como
// entró.
//
// De ahí salen dos consecuencias que este contraste respeta:
//
//  · Un giro repartido con el distribuidor NO es un desvío. El abono se
//    descuenta del pago de origen y hereda su referencia, así que la suma
//    sigue siendo la del giro. Se comprobó: de 217 desvíos, cero tenían
//    distribución de por medio, y hay 17 giros bien repartidos que no
//    aparecen. La herramienta correcta no se penaliza.
//
//  · Un pago sin cuota tampoco es un desvío: para eso está "por conciliar".
//
// El importe del CSV de Flywire —"Transfer Amount"— es lo que la universidad
// RECIBE, no lo que el estudiante envía (usuario, 18-08-2026). Así que no hay
// comisión que descontar: cualquier diferencia es un error de registro.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export type ClaseDesvio =
  | 'partido'        // varias filas del ERP para un giro; la suma SÍ cuadra
  | 'suma_distinta'  // la suma no coincide con el giro
  | 'no_registrado'  // Flywire lo mandó y el ERP no lo tiene

export interface CasoFlywire {
  giro: string
  flywire: number
  erp: number
  diferencia: number
  filas: number
  clase: ClaseDesvio
  student_id: string | null
  nombre: string
  documento: string | null
  fecha: string | null
}

export interface ResumenFlywire {
  giros_conocidos: number
  giros_en_el_erp: number
  cuadran: number
  repartidos_ok: number      // usaron el distribuidor y cuadran
  por_clase: Record<ClaseDesvio, number>
  falta_dinero: number       // suma de lo que el ERP registró de menos
  sobra_dinero: number       // suma de lo que registró de más
  casos: CasoFlywire[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(sb: SB, tabla: string, cols: string, orden: string): Promise<any[]> {
  const out: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(tabla).select(cols).order(orden).range(from, from + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return out as any[]
}

// El webhook guarda el importe en CÉNTIMOS y la importación por CSV en dólares.
// Se ve en los giros que tienen los dos eventos: 40000 y 400 son el mismo. Sin
// esta normalización el contraste inventaba faltantes de tres millones.
const importeDelEvento = (e: { event_type: string | null; amount_to: number | null }): number =>
  String(e.event_type) === 'csv_import' ? Number(e.amount_to) : Number(e.amount_to) / 100

const r2 = (n: number) => Math.round(n * 100) / 100

export async function auditarImportesFlywire(sb: SB): Promise<ResumenFlywire> {
  const [eventos, pagos, est] = await Promise.all([
    todo(sb, 'flywire_events', 'payment_id, amount_to, event_type, status, received_at, raw', 'id'),
    todo(sb, 'account_payments', 'id, student_id, amount, paid_date, flywire_payment_id, distributed_from_payment_id, transaction_reference', 'id'),
    todo(sb, 'academic_students', 'id, first_name, last_name, second_last_name, document_number', 'id'),
  ])

  const nombre = new Map<string, string>(est.map(e => [String(e.id), [e.first_name, e.last_name, e.second_last_name].filter(Boolean).join(' ')]))
  const documento = new Map<string, string>(est.map(e => [String(e.id), String(e.document_number ?? '')]))

  // El último evento manda: un giro pasa por initiated, guaranteed, processed y
  // delivered, y solo el final dice qué pasó de verdad.
  const ultimo = new Map<string, { monto: number; fecha: string | null; estado: string }>()
  for (const e of eventos.sort((a, b) => String(a.received_at).localeCompare(String(b.received_at)))) {
    if (!e.payment_id || e.amount_to == null) continue
    const fin = String((e.raw as { finished_date?: string } | null)?.finished_date ?? '').slice(0, 10) || null
    ultimo.set(String(e.payment_id), { monto: r2(importeDelEvento(e)), fecha: fin, estado: String(e.status ?? '').toLowerCase() })
  }

  // Solo se exige lo ENTREGADO.
  //
  // La primera importación metió el CSV entero —iniciados, caducados,
  // cancelados—, así que la tabla tiene 20.852 giros de los que 5.714 nunca
  // llegaron a pagarse. Contarlos como dinero ausente daba un millón de
  // dólares de falso faltante y enterraba los 49 casos que sí importan.
  //
  // Un giro cancelado no es un fallo del ERP: es un intento de pago que el
  // estudiante no completó.
  const giro = new Map<string, { monto: number; fecha: string | null }>()
  for (const [id, u] of ultimo) {
    if (u.estado !== 'delivered') continue
    giro.set(id, { monto: u.monto, fecha: u.fecha })
  }

  // Lo que el ERP tiene por giro: el pago de origen MÁS sus abonos de
  // distribución. Sumarlos es lo que impide que repartir bien parezca un error.
  const giroDelPago = new Map<string, string>()
  for (const p of pagos) if (p.flywire_payment_id) giroDelPago.set(String(p.id), String(p.flywire_payment_id))
  const enERP = new Map<string, number>()
  const filas = new Map<string, number>()
  const conDistribucion = new Set<string>()
  const dueño = new Map<string, string>()
  const fechaPago = new Map<string, string>()
  for (const p of pagos) {
    const g = p.flywire_payment_id ? String(p.flywire_payment_id)
      : (p.distributed_from_payment_id ? giroDelPago.get(String(p.distributed_from_payment_id)) : null)
    if (!g) continue
    enERP.set(g, r2((enERP.get(g) ?? 0) + Number(p.amount ?? 0)))
    filas.set(g, (filas.get(g) ?? 0) + 1)
    if (p.distributed_from_payment_id) conDistribucion.add(g)
    if (p.flywire_payment_id) {
      dueño.set(g, String(p.student_id))
      fechaPago.set(g, String(p.paid_date ?? '').slice(0, 10))
    }
  }

  // Un giro también puede estar en el ERP por el TEXTO de la referencia sin
  // llevar el flywire_payment_id: son las filas que quedaron partidas a mano,
  // con sufijos como "/05SEPTIEMBRE2023-". Se cuentan para no llamar
  // "no registrado" a un dinero que sí está.
  const porTexto = new Map<string, { suma: number; n: number; student_id: string | null; fecha: string | null }>()
  for (const p of pagos) {
    if (p.flywire_payment_id || p.distributed_from_payment_id) continue
    const ref = String(p.transaction_reference ?? '').match(/ZBL\d+/)?.[0]
    if (!ref) continue
    const a = porTexto.get(ref) ?? { suma: 0, n: 0, student_id: null, fecha: null }
    porTexto.set(ref, {
      suma: r2(a.suma + Number(p.amount ?? 0)), n: a.n + 1,
      student_id: a.student_id ?? String(p.student_id),
      fecha: a.fecha ?? String(p.paid_date ?? '').slice(0, 10),
    })
  }

  const casos: CasoFlywire[] = []
  let cuadran = 0, repartidosOk = 0
  for (const [id, g] of giro) {
    const suelto = porTexto.get(id)
    const erp = r2((enERP.get(id) ?? 0) + (suelto?.suma ?? 0))
    const nFilas = (filas.get(id) ?? 0) + (suelto?.n ?? 0)
    const sid = dueño.get(id) ?? suelto?.student_id ?? null
    if (nFilas === 0) {
      // Flywire lo mandó y en el ERP no hay ni rastro.
      casos.push({
        giro: id, flywire: g.monto, erp: 0, diferencia: g.monto, filas: 0, clase: 'no_registrado',
        student_id: null, nombre: '(sin identificar)', documento: null, fecha: g.fecha,
      })
      continue
    }
    const dif = r2(g.monto - erp)
    if (Math.abs(dif) <= 0.01) {
      cuadran++
      if (conDistribucion.has(id)) repartidosOk++
      // Cuadra en importe pero está en varias filas sin enlazar: la suma es
      // correcta, la forma no. Se señala aparte porque se arregla solo.
      if (suelto && suelto.n > 0) {
        casos.push({
          giro: id, flywire: g.monto, erp, diferencia: 0, filas: nFilas, clase: 'partido',
          student_id: sid, nombre: sid ? (nombre.get(sid) ?? '—') : '—',
          documento: sid ? (documento.get(sid) ?? null) : null, fecha: g.fecha ?? fechaPago.get(id) ?? null,
        })
      }
      continue
    }
    casos.push({
      giro: id, flywire: g.monto, erp, diferencia: dif, filas: nFilas, clase: 'suma_distinta',
      student_id: sid, nombre: sid ? (nombre.get(sid) ?? '—') : '—',
      documento: sid ? (documento.get(sid) ?? null) : null, fecha: g.fecha ?? fechaPago.get(id) ?? null,
    })
  }

  const por: Record<ClaseDesvio, number> = { partido: 0, suma_distinta: 0, no_registrado: 0 }
  for (const c of casos) por[c.clase]++
  const soloSuma = casos.filter(c => c.clase === 'suma_distinta')

  return {
    giros_conocidos: giro.size,
    giros_en_el_erp: [...giro.keys()].filter(k => (filas.get(k) ?? 0) + (porTexto.get(k)?.n ?? 0) > 0).length,
    cuadran,
    repartidos_ok: repartidosOk,
    por_clase: por,
    falta_dinero: r2(soloSuma.filter(c => c.diferencia > 0).reduce((s, c) => s + c.diferencia, 0)),
    sobra_dinero: r2(Math.abs(soloSuma.filter(c => c.diferencia < 0).reduce((s, c) => s + c.diferencia, 0))),
    casos: casos.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)),
  }
}
