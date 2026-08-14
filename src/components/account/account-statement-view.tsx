'use client'

import { useState, useEffect } from 'react'
import { CampusAccessNotice } from './campus-access-notice'
import { computeTuition } from '@/lib/account-statement'
import type { Statement, ProgramAccount, ChargeRow, PaymentRow } from '@/lib/account-statement'
import { Wallet, TrendingDown, CheckCircle2, AlertTriangle, GraduationCap, FilePlus, Loader2, Trash2, Tag, BadgeDollarSign, FileCheck, Pencil, Plus, Gift, Layers, ArrowLeftRight } from 'lucide-react'
import { FlywirePayButton } from './flywire-pay-button'

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const fdate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')

const STATUS: Record<ChargeRow['status'], { label: string; cls: string }> = {
  pagada:    { label: 'Pagada',    cls: 'bg-green-50 text-green-700' },
  parcial:   { label: 'Parcial',   cls: 'bg-amber-50 text-amber-700' },
  vencida:   { label: 'Vencida',   cls: 'bg-red-50 text-red-700' },
  pendiente: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-500' },
}

// Una línea de la tabla: una cuota, y (si tiene) uno de sus pagos. Cuotas con varios pagos
// generan filas de continuación (solo columnas de pago).
interface LedgerRow { charge: ChargeRow; payment: PaymentRow | null; first: boolean }

function buildLedger(charges: ChargeRow[], payments: PaymentRow[]): LedgerRow[] {
  const byCharge = new Map<string, PaymentRow[]>()
  for (const p of payments) {
    if (!p.charge_external_id) continue
    const l = byCharge.get(p.charge_external_id) ?? []
    l.push(p); byCharge.set(p.charge_external_id, l)
  }
  const rows: LedgerRow[] = []
  for (const c of charges) {
    const ps = (byCharge.get(c.external_id) ?? []).sort((a, b) => (a.paid_date ?? '').localeCompare(b.paid_date ?? ''))
    if (ps.length === 0) rows.push({ charge: c, payment: null, first: true })
    else ps.forEach((p, i) => rows.push({ charge: c, payment: p, first: i === 0 }))
  }
  return rows
}

export function AccountStatementView(
  { statement, showStudent = false, canGenerate = false, canDiscount = false, onChanged }:
  { statement: Statement; showStudent?: boolean; canGenerate?: boolean; canDiscount?: boolean; onChanged?: () => void }
) {
  const { student, programs } = statement
  const [sel, setSel] = useState(0)

  if (!student) return <p className="text-sm text-gray-500 py-10 text-center">Sin estado de cuenta para este estudiante.</p>
  if (programs.length === 0) {
    return (
      <div className="space-y-3">
        {showStudent && <StudentHeader student={student} />}
        <p className="text-sm text-gray-500 py-10 text-center">Este estudiante no tiene cuotas ni pagos registrados.</p>
      </div>
    )
  }

  const idx = sel < programs.length ? sel : 0
  const account = programs[idx]

  return (
    <div className="space-y-5">
      {showStudent && <StudentHeader student={student} />}

      {programs.length > 1 ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" /> Programa:</span>
          {programs.map((p, i) => (
            <button key={p.enrollment_id ?? i} onClick={() => setSel(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                i === idx ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {p.program_name}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <GraduationCap className="w-4 h-4 text-gray-400" /> {account.program_name}
        </p>
      )}

      <ProgramAccountView account={account} canGenerate={canGenerate} canDiscount={canDiscount} onChanged={onChanged} student={student} />

      {/* Las reglas de acceso, al pie: es donde el estudiante mira cuando le
          importa, y el mismo texto lo ve quien atiende desde el ERP. */}
      <CampusAccessNotice />
    </div>
  )
}

// `student` llega completo (no solo el nombre) porque el botón de pago prellena
// los campos obligatorios del portal de Flywire: documento y correo incluidos.
function ProgramAccountView({ account, canGenerate, canDiscount = false, onChanged, student }: { account: ProgramAccount; canGenerate: boolean; canDiscount?: boolean; onChanged?: () => void; student?: NonNullable<Statement['student']> }) {
  const { totals } = account
  const ledger = buildLedger(account.charges, account.payments)

  if (account.charges.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 space-y-3">
        <p className="text-sm text-gray-500 text-center">Este programa aún no tiene cuotas generadas.</p>
        {canGenerate && account.enrollment_id && <div className="text-center"><GenerateButton enrollmentId={account.enrollment_id} onChanged={onChanged} /></div>}
        {/* Pagos recibidos sin cuota (típico del grupo "Sin programa"): dinero
            real que espera destino — no se esconde, se muestra con su salida. */}
        {account.payments.length > 0 && (
          <div className="border border-amber-200 rounded-lg overflow-hidden">
            <p className="px-3 py-2 bg-amber-50 text-xs font-medium text-amber-800">
              💰 Pagos recibidos sin cuota asociada ({account.payments.length}) — total ${account.totals.paid.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {account.payments.map(p => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-gray-600">{p.paid_date ? p.paid_date.split('-').reverse().join('/') : '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{p.transaction_reference ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">${Number(p.amount).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[11px] text-amber-600 border-t border-amber-100">
              Enlázalos a una cuota (o márcalos &quot;sin cuota&quot;) en Finanzas → Pagos por Conciliar.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Fila 1: precios oficiales y beneficios (regla del usuario 2026-07-23):
          ahorro TC se resta PRIMERO; la beca se calcula sobre (lista − ahorro);
          Total Tuition = lista − ahorro − beca. */}
      {(() => {
        const t = computeTuition(account)
        if (!t) return null
        const { lista, ahorro, beca, bonus, total: totalTuition } = t
        const becaBase = Math.max(0, lista - ahorro)
        const afterBeca = Math.round((lista - ahorro - beca) * 100) / 100
        const subTotal = ['precio oficial', ahorro > 0 ? 'ahorro' : null, 'beca', account.bonus_pct != null ? 'bonus' : null].filter(Boolean).join(' − ')
        return (
          <div className="flex flex-wrap gap-3">
            {/* Los créditos son un dato, no una división. Antes se deducían de
                lista ÷ tarifa, así que la tarjeta decía "102 cr" sin que
                existiera ningún sitio con 102 créditos: era el rastro de un
                precio mal calculado, disfrazado de cuenta exacta. */}
            <div className="flex-1 min-w-[160px]"><Card icon={<BadgeDollarSign className="w-4 h-4" />} label="Precio oficial" value={money(lista)} cls="text-blue-700"
              sub={account.credit_rate
                ? `${account.billable_credits ?? Math.round(lista / account.credit_rate)} cr que lleva × ${money(account.credit_rate)}`
                : undefined} /></div>
            {ahorro > 0 && (
              <div className="flex-1 min-w-[160px]"><Card icon={<FileCheck className="w-4 h-4" />} label="Transfer Credit Savings" value={money(ahorro)} cls="text-teal-700"
                sub={`${account.transfer_credits} cr convalidados × ${money(account.credit_rate!)}`} /></div>
            )}
            {account.scholarship_pct != null && (
              <div className="flex-1 min-w-[160px]"><Card icon={<GraduationCap className="w-4 h-4" />} label="Beca" value={money(beca)} cls="text-violet-700"
                sub={`${account.scholarship_pct}% de ${money(becaBase)}`} /></div>
            )}
            {/* Monto fijo (Cashpay) o porcentaje: el subtítulo dice cuál es el
                dato aprobado, para que se pueda reconciliar con la solicitud. */}
            {(account.bonus_pct != null || account.bonus_amount != null) && (
              <div className="flex-1 min-w-[160px]"><Card icon={<Gift className="w-4 h-4" />} label="Bonus" value={money(bonus)} cls="text-emerald-700"
                sub={account.bonus_amount != null ? 'monto fijo aprobado' : `${account.bonus_pct}% de ${money(afterBeca)} (tras beca)`} /></div>
            )}
            <div className="flex-1 min-w-[160px]"><Card icon={<Wallet className="w-4 h-4" />} label="Total Tuition" value={money(totalTuition)} cls="text-gray-900"
              sub={subTotal} /></div>
          </div>
        )
      })()}
      {/* Fila 2: movimiento de la cuenta */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card icon={<Wallet className="w-4 h-4" />} label="Facturado" value={money(totals.charged)} cls="text-gray-900" />
        <Card icon={<CheckCircle2 className="w-4 h-4" />} label="Pagado" value={money(totals.paid)} cls="text-green-600" />
        <Card icon={<Tag className="w-4 h-4" />} label="Descuentos" value={money(totals.discounts)} cls={totals.discounts > 0 ? 'text-violet-600' : 'text-gray-400'} />
        <Card icon={<TrendingDown className="w-4 h-4" />} label="Saldo" value={money(totals.balance)} cls={totals.balance > 0 ? 'text-gray-900' : 'text-green-600'} />
        <Card icon={<AlertTriangle className="w-4 h-4" />} label="Vencido" value={money(totals.overdue)} cls={totals.overdue > 0 ? 'text-red-600' : 'text-gray-400'} />
      </div>

      {canGenerate && account.enrollment_id && (
        <div className="flex justify-end gap-2">
          {/* Refacturar es del mismo peso que un descuento (reescribe el libro
              de cuotas), así que va con el permiso de descuentos, no con el de
              crear una cuota suelta. */}
          {canDiscount && <RebillButton enrollmentId={account.enrollment_id} charges={account.charges} onChanged={onChanged} />}
          <NewChargeButton enrollmentId={account.enrollment_id} onChanged={onChanged} />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wide">
              <th className="text-left px-3 py-2.5">Vencimiento</th>
              <th className="text-left px-3 py-2.5">Concepto</th>
              <th className="text-right px-3 py-2.5">Cuota</th>
              <th className="text-left px-3 py-2.5">Fecha Pago</th>
              <th className="text-left px-3 py-2.5">Recibo</th>
              <th className="text-left px-3 py-2.5">Referencia</th>
              <th className="text-right px-3 py-2.5">Pago</th>
              <th className="text-right px-3 py-2.5">Saldo</th>
              <th className="text-center px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 ? (
              <tr><td colSpan={10} className="text-center text-gray-400 py-6">Sin movimientos</td></tr>
            ) : ledger.map((r, i) => {
              const c = r.charge, p = r.payment
              return (
                <tr key={p ? p.id : c.id + '-' + i} className="border-t border-gray-50 hover:bg-gray-50/50">
                  {/* Columnas de cuota (solo en la primera fila de la cuota) */}
                  <td className="px-3 py-2.5 text-gray-700">{r.first ? fdate(c.due_date) : ''}</td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {r.first && (
                      <span title={c.concept_name} className="cursor-help border-b border-dotted border-gray-300">
                        {c.concept_abbr}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{r.first ? money(c.amount) : ''}</td>
                  {/* Columnas de pago */}
                  <td className="px-3 py-2.5 text-gray-700">{p ? fdate(p.paid_date) : '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500">{p?.receipt_number ?? '—'}</td>
                  <td className={`px-3 py-2.5 text-xs ${p?.is_discount ? 'text-violet-600 font-medium' : 'text-gray-500'}`}>
                    {p ? (
                      <span className="inline-flex items-center gap-1.5">
                        {p.is_discount && <Tag className="w-3 h-3" />}
                        {p.transaction_reference ?? '—'}
                        {canGenerate && (
                          <button
                            onClick={async () => {
                              const ref = prompt('Referencia del pago:', p.transaction_reference ?? '')
                              if (ref === null) return
                              const d = await fetch('/api/account/payments', {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: p.id, transaction_reference: ref }),
                              }).then(x => x.json())
                              if (d.error) { alert(d.error); return }
                              onChanged?.()
                            }}
                            title="Editar referencia" className="text-gray-300 hover:text-blue-600">
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {/* Mover el pago a otra cuota. Distinto de distribuir:
                            aquí no sobra dinero, es que se aplicó a la cuota
                            equivocada —el caso típico es un reembolso que tarda
                            y un reabono que llega antes—. */}
                        {canGenerate && !p.transaction_reference?.includes('reembolso de') && (
                          <button
                            onClick={async () => {
                              const impagas = account.charges
                                .filter(x => x.external_id !== c.external_id && Number(x.amount ?? 0) - Number(x.paid ?? 0) > 0.005)
                                .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
                              if (!impagas.length) { alert('Este estudiante no tiene otra cuota con saldo pendiente.'); return }
                              const opciones = impagas.map((x, i) =>
                                `${i + 1}. ${x.due_date ? x.due_date.split('-').reverse().join('/') : 'sin vencimiento'} — falta ${money(Number(x.amount ?? 0) - Number(x.paid ?? 0))}`).join('\n')
                              const elegido = prompt(`Mover ${money(p.amount)} (${p.transaction_reference ?? 'sin referencia'}) a otra cuota.\n\n${opciones}\n\nEscribe el número:`)
                              if (elegido === null) return
                              const idx = Number(elegido.trim()) - 1
                              if (!(idx >= 0 && idx < impagas.length)) { alert('Número fuera de la lista.'); return }
                              const d = await fetch('/api/account/move-payment', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ payment_id: p.id, charge_external_id: impagas[idx].external_id }),
                              }).then(x => x.json())
                              if (d.error) { alert(d.error); return }
                              alert(`Pago movido.${d.reembolsos_movidos ? ` Su reembolso viajó con él.` : ''}${d.matricula_activada ? ' La matrícula quedó activada.' : ''}`)
                              onChanged?.()
                            }}
                            title="Mover este pago a otra cuota" className="text-gray-300 hover:text-blue-600">
                            <ArrowLeftRight className="w-3 h-3" />
                          </button>
                        )}
                        {canGenerate && p.deletable && (
                          <button
                            onClick={async () => {
                              if (!confirm(`¿Borrar este pago de ${money(p.amount)} (${p.transaction_reference ?? 'sin referencia'})? Se usa para quitar pagos heredados de SystemActiva. Esta acción no se puede deshacer.`)) return
                              const d = await fetch('/api/account/payments', {
                                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: p.id }),
                              }).then(x => x.json())
                              if (d.error) { alert(d.error); return }
                              onChanged?.()
                            }}
                            title="Borrar pago (p. ej. heredado de SystemActiva)" className="text-gray-300 hover:text-red-600">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ) : (r.first && c.reference ? c.reference : '—')}
                  </td>
                  <td className={`px-3 py-2.5 text-right ${p?.is_discount ? 'text-violet-600' : 'text-green-600'}`}>{p ? money(p.amount) : '—'}</td>
                  {/* Rollup de la cuota */}
                  <td className="px-3 py-2.5 text-right font-medium text-gray-900">{r.first ? money(c.balance) : ''}</td>
                  <td className="px-3 py-2.5 text-center">
                    {r.first && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS[c.status].cls}`}>
                        {STATUS[c.status].label}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {r.first && c.balance > 0.005 && c.status !== 'pagada' && (
                        <FlywirePayButton chargeExternalId={c.external_id} amount={c.balance}
                          studentName={student?.name} studentDocument={student?.document_number} studentEmail={student?.email} />
                      )}
                      {r.first && canDiscount && c.balance > 0.005 && (
                        <DiscountButton charge={c} onChanged={onChanged} />
                      )}
                      {r.first && canGenerate && (
                        <EditChargeButton charge={c} onChanged={onChanged} />
                      )}
                      {r.first && canGenerate && (
                        <DeleteChargeButton charge={c} disabled={c.paid > 0.005} onChanged={onChanged} />
                      )}
                      {/* El excedente se reparte desde el pago concreto que lo
                          dejó, no desde la cuota: con varios pagos encima, "de
                          cuál sobra" solo lo sabe quien mira el giro. */}
                      {p && !p.is_discount && c.balance < -0.005 && canGenerate && (
                        <DistributeButton payment={p} charge={c} charges={account.charges} onChanged={onChanged} />
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Aplicar descuento a una cuota (solo SUPERADMIN — el backend lo exige).
// El descuento reduce el saldo como un pago, con serie DESCUENTO y código;
// arriba suma en su propia tarjeta. Las becas seguirán esta estructura.
// Repartir el saldo a favor de una cuota entre las cuotas que deben.
//
// El estudiante gira el total del programa cuando lo único facturado es la
// matrícula. Ese dinero se queda sobre la matrícula como saldo a favor, y
// según van naciendo las cuotas —la primera de tuition, meses después el cargo
// del certificado— Cobranzas lo va aplicando. Puede hacerse en varias veces:
// lo que no se reparte hoy sigue disponible mañana.
function DistributeButton(
  { payment, charge, charges, onChanged }:
  { payment: PaymentRow; charge: ChargeRow; charges: ChargeRow[]; onChanged?: () => void }
) {
  const [abierto, setAbierto] = useState(false)
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tope real: no se puede mover más de lo que sobra en la cuota ni más de lo
  // que trajo este pago.
  const disponible = Math.round(Math.min(-charge.balance, payment.amount) * 100) / 100
  const deben = charges.filter(c => c.external_id !== charge.external_id && c.balance > 0.005)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))

  // Propuesta por defecto: las más antiguas primero, que es como se cobra.
  const abrir = () => {
    let queda = disponible
    const prop: Record<string, string> = {}
    for (const c of deben) {
      const da = Math.round(Math.min(queda, c.balance) * 100) / 100
      if (da > 0.005) { prop[c.external_id] = da.toFixed(2); queda = Math.round((queda - da) * 100) / 100 }
    }
    setMontos(prop); setError(null); setAbierto(true)
  }

  const repartido = Math.round(Object.values(montos).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100
  const sobra = Math.round((disponible - repartido) * 100) / 100

  const guardar = async () => {
    setGuardando(true); setError(null)
    const res = await fetch('/api/account/distribute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_id: payment.id,
        allocations: Object.entries(montos)
          .map(([charge_external_id, v]) => ({ charge_external_id, amount: Number(v) || 0 }))
          .filter(a => a.amount > 0),
      }),
    })
    const d = await res.json().catch(() => ({}))
    setGuardando(false)
    if (!res.ok) { setError(d.error ?? 'No se pudo distribuir'); return }
    setAbierto(false); onChanged?.()
  }

  return (
    <>
      <button onClick={abrir} title={`Distribuir ${money(disponible)} de saldo a favor`}
        className="text-emerald-600 hover:text-emerald-800">
        <Layers className="w-3.5 h-3.5" />
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setAbierto(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900">Distribuir saldo a favor</h3>
            <p className="text-xs text-gray-500 mt-1">
              Del pago {payment.transaction_reference ?? 'sin referencia'} de {money(payment.amount)} sobre{' '}
              {charge.concept_name}. Disponible: <strong className="text-emerald-700">{money(disponible)}</strong>.
            </p>

            {deben.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">
                No hay cuotas pendientes. El saldo queda a favor hasta que nazca la próxima.
              </p>
            ) : (
              <div className="mt-4 space-y-1.5 max-h-72 overflow-y-auto">
                {deben.map(c => (
                  <div key={c.external_id} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 text-gray-700">
                      {c.concept_name}
                      <span className="text-gray-400"> · vence {fdate(c.due_date)} · debe {money(c.balance)}</span>
                    </span>
                    <input type="number" step="0.01" min="0" max={c.balance}
                      value={montos[c.external_id] ?? ''}
                      onChange={e => setMontos({ ...montos, [c.external_id]: e.target.value })}
                      className="w-24 border rounded-lg px-2 py-1 text-right text-sm" placeholder="0.00" />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between text-sm border-t pt-3">
              <span className="text-gray-500">
                Repartes <strong className="text-gray-900">{money(repartido)}</strong>
                {sobra > 0.005 && <> · quedan {money(sobra)} a favor</>}
              </span>
              {sobra < -0.005 && <span className="text-red-600 text-xs">Te pasas por {money(-sobra)}</span>}
            </div>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAbierto(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
              <button onClick={guardar} disabled={guardando || repartido <= 0.005 || sobra < -0.005}
                className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-40 inline-flex items-center gap-1.5">
                {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Distribuir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DiscountButton({ charge, onChanged }: { charge: ChargeRow; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false)
  async function apply() {
    const montoStr = prompt(
      `Descuento para la cuota de ${money(charge.amount)} (${charge.concept_abbr}).\nSaldo actual: ${money(charge.balance)}.\n\nMonto del descuento:`,
      String(charge.balance.toFixed(2)))
    if (montoStr == null) return
    const monto = Number(montoStr)
    if (!Number.isFinite(monto) || monto <= 0) { alert('Monto inválido'); return }
    const code = prompt('Código del descuento (déjalo así para autogenerar):', `DSC-${new Date().getFullYear()}`)
    if (code == null) return
    if (!confirm(`¿Aplicar descuento de ${money(monto)} con código ${code || '(auto)'}? Reducirá el saldo de la cuota.`)) return
    setBusy(true)
    const d = await fetch('/api/account/discount', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ charge_external_id: charge.external_id, amount: monto, code }),
    }).then(r => r.json())
    setBusy(false)
    if (d.error) alert(d.error)
    else onChanged?.()
  }
  return (
    <button onClick={apply} disabled={busy}
      title="Aplicar descuento (solo superadministrador)"
      className="text-gray-300 hover:text-violet-600 disabled:opacity-40">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
    </button>
  )
}

// Borrar cuota (solo admin). Deshabilitado si tiene pagos: el backend además
// lo rechaza — primero se desenlazan los pagos.
function DeleteChargeButton({ charge, disabled, onChanged }: { charge: ChargeRow; disabled: boolean; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false)
  async function del() {
    if (!confirm(`¿Borrar la cuota de ${money(charge.amount)} (${charge.concept_abbr})? Esta acción no se puede deshacer.`)) return
    setBusy(true)
    const d = await fetch('/api/account/charges', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_id: charge.external_id }),
    }).then(r => r.json())
    setBusy(false)
    if (d.error) alert(d.error)
    else onChanged?.()
  }
  return (
    <button onClick={del} disabled={disabled || busy}
      title={disabled ? 'Tiene pagos enlazados: desenlázalos antes de borrar' : 'Borrar cuota'}
      className="text-gray-300 hover:text-red-500 disabled:hover:text-gray-200 disabled:opacity-40">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  )
}

// Modal compartido de cuota (crear/editar): vencimiento + monto (positivo) +
// concepto + referencia. onSubmit hace el fetch (POST o PATCH) y devuelve {error?}.
interface ChargeConcept { type_code: number; abbr: string | null; name: string | null }
interface ChargeFormValues { due_date: string | null; amount: number; charge_type: number; reference: string | null }
function ChargeFormModal(
  { mode, title, initial, onClose, onSubmit }:
  {
    mode: 'create' | 'edit'
    title: string
    initial?: { due_date?: string | null; amount?: number | null; charge_type?: number | null; reference?: string | null }
    onClose: () => void
    onSubmit: (v: ChargeFormValues) => Promise<{ error?: string }>
  }
) {
  const [concepts, setConcepts] = useState<ChargeConcept[]>([])
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [conceptType, setConceptType] = useState(initial?.charge_type != null ? String(initial.charge_type) : '')
  const [reference, setReference] = useState(initial?.reference ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/account/charges').then(r => r.json()).then(d => {
      setConcepts(d.concepts ?? [])
      // Solo autoselecciona en creación; en edición respeta el concepto actual.
      if (mode === 'create' && (d.concepts ?? []).length) setConceptType(prev => prev || String(d.concepts[0].type_code))
    }).catch(() => setConcepts([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit() {
    const monto = Number(amount)
    if (!Number.isFinite(monto) || monto <= 0) { setErr('El monto debe ser un número positivo'); return }
    if (!conceptType) { setErr('Selecciona un concepto'); return }
    setBusy(true); setErr(null)
    const d = await onSubmit({ due_date: dueDate || null, amount: monto, charge_type: Number(conceptType), reference: reference || null })
    setBusy(false)
    if (d.error) { setErr(d.error); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          {mode === 'create' ? <FilePlus className="w-4 h-4 text-blue-600" /> : <Pencil className="w-4 h-4 text-blue-600" />} {title}
        </h3>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500">Concepto</span>
            <select value={conceptType} onChange={e => setConceptType(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="" disabled>Selecciona…</option>
              {concepts.map(c => (
                <option key={c.type_code} value={c.type_code}>{c.abbr ? `${c.abbr} — ${c.name ?? ''}` : (c.name ?? `Tipo ${c.type_code}`)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">Monto (USD)</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">Fecha de vencimiento</span>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">Referencia</span>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)}
              placeholder="Opcional"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={busy}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={submit} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (mode === 'create' ? <Plus className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />)}
            {mode === 'create' ? 'Crear cuota' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Refacturar: cambiar el plan de cuotas de golpe ─────────────────────────
// Pensado para el caso "la plantilla creó 18 cuotas de 156 y quiero otro
// esquema": nadie debería editar 18 filas a mano.
//
// Muestra SIEMPRE la vista previa antes de aplicar, porque lo que se está
// tocando es lo que el estudiante debe. La previa dice exactamente qué se
// borra, qué se conserva por tener movimientos, y qué se crea.
interface RebillCharge { external_id: string; amount: number; due_date: string | null }
interface RebillPreview {
  ok: boolean; error?: string; blocked?: string; applied?: boolean
  replace: RebillCharge[]; keep: (RebillCharge & { reason: string })[]
  create: { amount: number; due_date: string }[]
  totalReplaced: number; totalNew: number
  tuitionTarget?: number | null; scholarshipPct?: number | null; matchesTarget?: boolean
}
// Plantilla de facturación tal como la ve este diálogo. La fecha no vive en la
// plantilla —sale del inicio de clases de la convocatoria— así que el servidor
// la calcula para ESTA matrícula y la manda ya resuelta.
interface PlanRow {
  id: string; name: string
  installments_count: number; installment_amount: number
  installment_concept: number | null; first_due_date: string | null; due_day: number | null
  destinos: string[]; es_la_suya: boolean
}

function RebillButton(
  { enrollmentId, charges, onChanged }:
  { enrollmentId: string; charges: ChargeRow[]; onChanged?: () => void }
) {
  const [open, setOpen] = useState(false)
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [sinInicio, setSinInicio] = useState(false)

  // Conceptos presentes en la cuenta, con cuánto de cada uno se puede
  // realmente reemplazar: una cuota con cualquier pago o descuento queda
  // intocable, así que sumarla aquí sería prometer lo que no se va a cumplir.
  const conceptos = (() => {
    const m = new Map<string, { abbr: string; name: string; total: number; libres: number; monto: number }>()
    for (const c of charges) {
      const k = String(c.charge_type ?? '')
      const e = m.get(k) ?? { abbr: c.concept_abbr, name: c.concept_name, total: 0, libres: 0, monto: 0 }
      e.total++
      if (Number(c.paid ?? 0) <= 0.005) { e.libres++; e.monto += Number(c.amount ?? 0) }
      m.set(k, e)
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.monto - a.monto || b.total - a.total)
  })()

  // Por defecto, el concepto con MÁS dinero reemplazable. Antes era el más
  // repetido, y con una matrícula pagada y una sola cuota de pensión el empate
  // lo ganaba la matrícula: el diálogo intentaba refacturar cuotas pagadas y
  // respondía "ninguna cuota se puede reemplazar" sin decir por qué.
  const conceptoSugerido = conceptos.find(c => c.monto > 0)?.key ?? conceptos[0]?.key ?? ''

  const [concept, setConcept] = useState(conceptoSugerido)
  const [count, setCount] = useState('')
  const [amount, setAmount] = useState('')
  const [firstDue, setFirstDue] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [allowTotalChange, setAllowTotalChange] = useState(false)
  const [prev, setPrev] = useState<RebillPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // Las plantillas vigentes son las de billing_templates (programa/categoría/
    // colección). Antes esto leía billing_plans, el modelo viejo por
    // convocatoria: el diálogo ofrecía planes que ya nadie mantenía.
    fetch(`/api/billing/templates?enrollment_id=${enrollmentId}`).then(r => r.json()).then(d => {
      setPlans(d.plans ?? [])
      setSinInicio(!!d.sin_inicio_de_clases)
    }).catch(() => null)
  }, [open, enrollmentId])

  function usarPlan(id: string) {
    const p = plans.find(x => x.id === id)
    if (!p) return
    setCount(String(p.installments_count ?? ''))
    setAmount(String(p.installment_amount ?? ''))
    setFirstDue(p.first_due_date ? String(p.first_due_date).slice(0, 10) : '')
    setDueDay(p.due_day != null ? String(p.due_day) : '')
    // El concepto de la plantilla solo se copia si esa cuenta lo tiene: si no,
    // el desplegable quedaría apuntando a un concepto sin cuotas.
    if (p.installment_concept != null && conceptos.some(c => c.key === String(p.installment_concept))) {
      setConcept(String(p.installment_concept))
    }
    setPrev(null)
  }

  async function llamar(dryRun: boolean) {
    setBusy(true); setErr(null)
    const res = await fetch('/api/account/rebill', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollment_id: enrollmentId, concept: concept === '' ? null : Number(concept),
        installments_count: Number(count), installment_amount: Number(amount),
        first_due_date: firstDue, due_day: dueDay === '' ? null : Number(dueDay),
        dry_run: dryRun, allow_total_change: allowTotalChange,
      }),
    })
    const d = await res.json() as RebillPreview
    setBusy(false)
    if (d.error) { setErr(d.error); setPrev(null); return }
    setPrev(d)
    if (d.applied) { onChanged?.(); setTimeout(() => { setOpen(false); setPrev(null) }, 1200) }
  }

  const listo = !!count && !!amount && !!firstDue
  const difiere = prev && Math.abs(prev.totalNew - prev.totalReplaced) > 0.005

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
        <Layers className="w-3.5 h-3.5" /> Refacturar cuotas
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Refacturar cuotas</h3>
              <button onClick={() => !busy && setOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <p className="text-[12px] text-gray-500 leading-relaxed">
              Reemplaza de una vez las cuotas pendientes de un concepto por un plan nuevo. Las cuotas con pagos o
              descuentos <strong>no se tocan</strong>, y el concepto inicial (matrícula) tampoco.
            </p>

            {plans.length > 0 && (
              <label className="block">
                <span className="block text-xs text-gray-500 mb-1">Copiar de una plantilla de facturación</span>
                <select onChange={e => usarPlan(e.target.value)} defaultValue=""
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Escribir los valores a mano…</option>
                  {plans.filter(p => Number(p.installments_count) > 0).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.installments_count} × {Number(p.installment_amount).toFixed(2)} · {p.name}
                      {p.es_la_suya ? ' · la de este programa' : ''}
                      {p.destinos.length ? ` (${p.destinos.slice(0, 3).join(', ')}${p.destinos.length > 3 ? '…' : ''})` : ''}
                    </option>
                  ))}
                </select>
                {sinInicio && (
                  <span className="block text-[11px] text-amber-700 mt-1">
                    Su convocatoria no tiene fecha de inicio de clases, así que el primer vencimiento no se puede
                    calcular: al copiar una plantilla tendrás que escribirlo tú.
                  </span>
                )}
              </label>
            )}

            {/* El concepto decide QUÉ cuotas se reemplazan. Estaba oculto y se
                adivinaba, así que cuando la adivinanza fallaba el error no
                tenía arreglo visible. */}
            <label className="block">
              <span className="block text-xs text-gray-500 mb-1">Concepto a refacturar</span>
              <select value={concept} onChange={e => { setConcept(e.target.value); setPrev(null) }}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {conceptos.map(c => (
                  <option key={c.key} value={c.key}>
                    {c.abbr} · {c.name} — {c.libres > 0
                      ? `${c.libres} de ${c.total} cuota(s) reemplazable(s), ${money(c.monto)}`
                      : `sin cuotas reemplazables (${c.total} con pagos o descuentos)`}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="block"><span className="block text-xs text-gray-500 mb-1">Nº de cuotas</span>
                <input type="number" min="1" value={count} onChange={e => { setCount(e.target.value); setPrev(null) }} className={inp2} /></label>
              <label className="block"><span className="block text-xs text-gray-500 mb-1">Monto por cuota</span>
                <input type="number" step="0.01" min="0" value={amount} onChange={e => { setAmount(e.target.value); setPrev(null) }} className={inp2} /></label>
              <label className="block"><span className="block text-xs text-gray-500 mb-1">Primer vencimiento</span>
                <input type="date" value={firstDue} onChange={e => { setFirstDue(e.target.value); setPrev(null) }} className={inp2} /></label>
              <label className="block"><span className="block text-xs text-gray-500 mb-1">Día de pago</span>
                <input type="number" min="1" max="31" value={dueDay} onChange={e => { setDueDay(e.target.value); setPrev(null) }} placeholder="igual que arriba" className={inp2} /></label>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              <strong>Primer vencimiento</strong> fija el mes en que arranca el plan; de ahí en adelante va una cuota por
              mes. <strong>Día de pago</strong> es opcional y manda sobre el día de <em>todas</em> las cuotas, incluida la
              primera: con 01/09/2026 y día 15, la primera vence el 15/09/2026. Si lo dejas vacío se usa el día del primer
              vencimiento. En meses cortos se ajusta al último día (31 → 28 en febrero).
            </p>

            {listo && !prev && (
              <button onClick={() => llamar(true)} disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Ver qué va a pasar
              </button>
            )}

            {err && <p className="text-[12.5px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>}

            {prev && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-gray-200 p-2.5">
                    <p className="text-[10.5px] text-gray-400 uppercase tracking-wide">Se eliminan</p>
                    <p className="text-base font-bold text-gray-800">{prev.replace.length}</p>
                    <p className="text-[11px] text-gray-500">{money(prev.totalReplaced)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-2.5">
                    <p className="text-[10.5px] text-gray-400 uppercase tracking-wide">Se crean</p>
                    <p className="text-base font-bold text-gray-800">{prev.create.length}</p>
                    <p className="text-[11px] text-gray-500">{money(prev.totalNew)}</p>
                  </div>
                  <div className={`rounded-lg border p-2.5 ${prev.matchesTarget ? 'border-green-200 bg-green-50' : difiere ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
                    <p className="text-[10.5px] text-gray-400 uppercase tracking-wide">Total Tuition</p>
                    <p className={`text-base font-bold ${prev.matchesTarget ? 'text-green-700' : difiere ? 'text-amber-700' : 'text-gray-800'}`}>
                      {prev.tuitionTarget != null ? money(prev.tuitionTarget) : '—'}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {prev.tuitionTarget == null ? 'sin precio oficial'
                        : prev.matchesTarget ? '✓ el plan cuadra'
                        : prev.scholarshipPct != null ? `beca ${prev.scholarshipPct}%` : 'no cuadra'}
                    </p>
                  </div>
                </div>

                {/* El objetivo real no es "que el total no cambie": es que el plan
                    cuadre con lo que el estudiante debe tras su beca. Cuando se
                    otorga una beca nueva el total DEBE cambiar. */}
                {prev.matchesTarget && difiere && (
                  <p className="text-[12.5px] text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                    El total cambia respecto de las cuotas anteriores, pero el plan nuevo <strong>cuadra exactamente con
                    el Total Tuition vigente</strong>{prev.scholarshipPct != null ? ` (beca del ${prev.scholarshipPct}%)` : ''}. Es lo esperado si acabas de
                    actualizar la beca.
                  </p>
                )}

                {prev.keep.length > 0 && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-[11.5px] font-medium text-gray-700 mb-1">Se conservan {prev.keep.length} cuota(s):</p>
                    {prev.keep.map(k => (
                      <p key={k.external_id} className="text-[11px] text-gray-500">· {money(Number(k.amount))} {k.due_date ? `(vence ${k.due_date})` : ''} — {k.reason}</p>
                    ))}
                  </div>
                )}

                {prev.create.length > 0 && (
                  <p className="text-[11.5px] text-gray-500">
                    Nuevo plan: {prev.create.length} × {money(prev.create[0].amount)}, del {prev.create[0].due_date} al {prev.create[prev.create.length - 1].due_date}.
                  </p>
                )}

                {prev.blocked && (
                  <p className="text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{prev.blocked}</p>
                )}

                {difiere && !prev.matchesTarget && !prev.applied && (
                  <label className="flex items-start gap-2 text-[12px] text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <input type="checkbox" checked={allowTotalChange} onChange={e => setAllowTotalChange(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
                    <span>
                      Entiendo que esto <strong>cambia lo que debe el estudiante</strong> en {money(prev.totalNew - prev.totalReplaced)}, y que el plan
                      {prev.tuitionTarget != null ? ` no cuadra con el Total Tuition vigente (${money(prev.tuitionTarget)})` : ' no se puede comparar con un precio oficial'}.
                      {prev.tuitionTarget != null && ' Si le otorgaste una beca nueva, actualízala primero en Becas y vuelve aquí.'}
                    </span>
                  </label>
                )}

                {prev.applied ? (
                  <p className="text-[13px] text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                    ✓ Refacturado: {prev.replace.length} cuota(s) reemplazadas por {prev.create.length}.
                  </p>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => llamar(false)} disabled={busy || (!!difiere && !prev.matchesTarget && !allowTotalChange)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Aplicar el cambio
                    </button>
                    <button onClick={() => setPrev(null)} disabled={busy}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                      Volver
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const inp2 = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// Crear una cuota manual en la cuenta de la matrícula (solo admin/cobranza).
function NewChargeButton({ enrollmentId, onChanged }: { enrollmentId: string; onChanged?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
        <Plus className="w-3.5 h-3.5" /> Nueva cuota
      </button>
      {open && (
        <ChargeFormModal mode="create" title="Nueva cuota" onClose={() => setOpen(false)}
          onSubmit={async v => {
            const d = await fetch('/api/account/charges', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enrollment_id: enrollmentId, ...v }),
            }).then(r => r.json())
            if (!d.error) onChanged?.()
            return d
          }} />
      )}
    </>
  )
}

// Editar una cuota existente (solo admin). Lápiz en la fila de la cuota.
function EditChargeButton({ charge, onChanged }: { charge: ChargeRow; onChanged?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} title="Editar cuota"
        className="text-gray-300 hover:text-blue-600">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      {open && (
        <ChargeFormModal mode="edit" title="Editar cuota"
          initial={{ due_date: charge.due_date, amount: charge.amount, charge_type: charge.charge_type, reference: charge.reference }}
          onClose={() => setOpen(false)}
          onSubmit={async v => {
            const d = await fetch('/api/account/charges', {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ external_id: charge.external_id, ...v }),
            }).then(r => r.json())
            if (!d.error) onChanged?.()
            return d
          }} />
      )}
    </>
  )
}

function GenerateButton({ enrollmentId, onChanged }: { enrollmentId: string; onChanged?: () => void }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function gen() {
    setLoading(true); setErr(null)
    const d = await fetch('/api/account/generate-charges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollment_id: enrollmentId }),
    }).then(r => r.json())
    setLoading(false)
    if (d.error) setErr(d.error)
    else onChanged?.()
  }
  return (
    <div className="space-y-2">
      <button onClick={gen} disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus className="w-4 h-4" />}
        Generar cuotas desde plantilla
      </button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

function StudentHeader({ student }: { student: NonNullable<Statement['student']> }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900">{student.name}</h2>
      <p className="text-xs text-gray-400">{student.document_number ?? student.email}</p>
    </div>
  )
}

function Card({ icon, label, value, cls, sub }: { icon: React.ReactNode; label: string; value: string; cls: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">{icon}{label}</div>
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 tabular-nums">{sub}</p>}
    </div>
  )
}
