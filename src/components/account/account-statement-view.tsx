'use client'

import { useState } from 'react'
import type { Statement, ProgramAccount, ChargeRow } from '@/lib/account-statement'
import { chargeTypeLabel } from '@/lib/account-types'
import { Wallet, TrendingDown, CheckCircle2, AlertTriangle, GraduationCap } from 'lucide-react'

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const fdate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')

const STATUS: Record<ChargeRow['status'], { label: string; cls: string }> = {
  pagada:    { label: 'Pagada',    cls: 'bg-green-50 text-green-700' },
  parcial:   { label: 'Parcial',   cls: 'bg-amber-50 text-amber-700' },
  vencida:   { label: 'Vencida',   cls: 'bg-red-50 text-red-700' },
  pendiente: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-500' },
}

export function AccountStatementView({ statement, showStudent = false }: { statement: Statement; showStudent?: boolean }) {
  const { student, programs } = statement
  const [sel, setSel] = useState(0)

  if (!student) {
    return <p className="text-sm text-gray-500 py-10 text-center">Sin estado de cuenta para este estudiante.</p>
  }
  if (programs.length === 0) {
    return (
      <div className="space-y-3">
        {showStudent && <StudentHeader student={student} />}
        <p className="text-sm text-gray-500 py-10 text-center">Este estudiante no tiene cuotas ni pagos registrados.</p>
      </div>
    )
  }

  const account = programs[Math.min(sel, programs.length - 1)]

  return (
    <div className="space-y-5">
      {showStudent && <StudentHeader student={student} />}

      {/* Selector de programa (cuenta económica independiente por programa) */}
      {programs.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" /> Programa:</span>
          {programs.map((p, i) => (
            <button key={p.enrollment_id ?? i} onClick={() => setSel(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                i === (sel < programs.length ? sel : 0)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {p.program_name}
            </button>
          ))}
        </div>
      )}
      {programs.length === 1 && (
        <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <GraduationCap className="w-4 h-4 text-gray-400" /> {account.program_name}
        </p>
      )}

      <ProgramAccountView account={account} />
    </div>
  )
}

function ProgramAccountView({ account }: { account: ProgramAccount }) {
  const { totals, charges, payments } = account
  return (
    <div className="space-y-5">
      {/* Totales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={<Wallet className="w-4 h-4" />} label="Facturado" value={money(totals.charged)} cls="text-gray-900" />
        <Card icon={<CheckCircle2 className="w-4 h-4" />} label="Pagado" value={money(totals.paid)} cls="text-green-600" />
        <Card icon={<TrendingDown className="w-4 h-4" />} label="Saldo" value={money(totals.balance)} cls={totals.balance > 0 ? 'text-gray-900' : 'text-green-600'} />
        <Card icon={<AlertTriangle className="w-4 h-4" />} label="Vencido" value={money(totals.overdue)} cls={totals.overdue > 0 ? 'text-red-600' : 'text-gray-400'} />
      </div>

      {/* Cuotas */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Cuotas ({charges.length})</h3>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-2.5">Vencimiento</th>
                <th className="text-left px-4 py-2.5">Concepto</th>
                <th className="text-left px-4 py-2.5">Convocatoria</th>
                <th className="text-right px-4 py-2.5">Monto</th>
                <th className="text-right px-4 py-2.5">Pagado</th>
                <th className="text-right px-4 py-2.5">Saldo</th>
                <th className="text-center px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {charges.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-gray-400 py-6">Sin cuotas registradas</td></tr>
              ) : charges.map(c => (
                <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-700">{fdate(c.due_date)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{chargeTypeLabel(c.charge_type)}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{c.convocatoria ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{money(c.amount)}</td>
                  <td className="px-4 py-2.5 text-right text-green-600">{c.paid > 0 ? money(c.paid) : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900">{money(c.balance)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS[c.status].cls}`}>
                      {STATUS[c.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagos */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Pagos ({payments.length})</h3>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-2.5">Fecha</th>
                <th className="text-left px-4 py-2.5">Recibo</th>
                <th className="text-left px-4 py-2.5">Referencia</th>
                <th className="text-right px-4 py-2.5">Monto</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-gray-400 py-6">Sin pagos registrados</td></tr>
              ) : payments.map(p => (
                <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-700">{fdate(p.paid_date)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{p.receipt_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{p.transaction_reference ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-green-600 font-medium">{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
