'use client'

import { useState } from 'react'
import type { Statement, ProgramAccount, ChargeRow, PaymentRow } from '@/lib/account-statement'
import { Wallet, TrendingDown, CheckCircle2, AlertTriangle, GraduationCap, FilePlus, Loader2, Trash2 } from 'lucide-react'
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
  { statement, showStudent = false, canGenerate = false, onChanged }:
  { statement: Statement; showStudent?: boolean; canGenerate?: boolean; onChanged?: () => void }
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

      <ProgramAccountView account={account} canGenerate={canGenerate} onChanged={onChanged} studentName={student.name} />
    </div>
  )
}

function ProgramAccountView({ account, canGenerate, onChanged, studentName }: { account: ProgramAccount; canGenerate: boolean; onChanged?: () => void; studentName?: string | null }) {
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={<Wallet className="w-4 h-4" />} label="Facturado" value={money(totals.charged)} cls="text-gray-900" />
        <Card icon={<CheckCircle2 className="w-4 h-4" />} label="Pagado" value={money(totals.paid)} cls="text-green-600" />
        <Card icon={<TrendingDown className="w-4 h-4" />} label="Saldo" value={money(totals.balance)} cls={totals.balance > 0 ? 'text-gray-900' : 'text-green-600'} />
        <Card icon={<AlertTriangle className="w-4 h-4" />} label="Vencido" value={money(totals.overdue)} cls={totals.overdue > 0 ? 'text-red-600' : 'text-gray-400'} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wide">
              <th className="text-left px-3 py-2.5">Vencimiento</th>
              <th className="text-left px-3 py-2.5">Concepto</th>
              <th className="text-right px-3 py-2.5">Monto Cuota</th>
              <th className="text-left px-3 py-2.5">Fecha Pago</th>
              <th className="text-left px-3 py-2.5">Recibo</th>
              <th className="text-left px-3 py-2.5">Referencia</th>
              <th className="text-right px-3 py-2.5">Monto Pago</th>
              <th className="text-right px-3 py-2.5">Pagado</th>
              <th className="text-right px-3 py-2.5">Saldo</th>
              <th className="text-center px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 ? (
              <tr><td colSpan={11} className="text-center text-gray-400 py-6">Sin movimientos</td></tr>
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
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{p?.transaction_reference ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-green-600">{p ? money(p.amount) : '—'}</td>
                  {/* Rollup de la cuota */}
                  <td className="px-3 py-2.5 text-right text-green-600">{r.first ? (c.paid > 0 ? money(c.paid) : '—') : ''}</td>
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
                        <FlywirePayButton chargeExternalId={c.external_id} amount={c.balance} studentName={studentName} />
                      )}
                      {r.first && canGenerate && (
                        <DeleteChargeButton charge={c} disabled={c.paid > 0.005} onChanged={onChanged} />
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

function Card({ icon, label, value, cls }: { icon: React.ReactNode; label: string; value: string; cls: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">{icon}{label}</div>
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
    </div>
  )
}
