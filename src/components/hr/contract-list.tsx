'use client'

import { useState } from 'react'
import { FileText, ExternalLink, CheckCircle2, Clock, Send, Loader2, PenLine } from 'lucide-react'

type Contract = {
  id: string
  contract_type: string
  position: string
  start_date: string
  end_date: string | null
  salary: number | null
  currency: string
  file_url: string | null
  notes: string | null
  created_at: string
  signnow_document_id?: string | null
  signnow_status?: string | null
}

const CONTRACT_TYPE: Record<string, string> = {
  indefinite: 'Indefinido',
  fixed_term: 'Plazo fijo',
  services: 'Locación de servicios',
  internship: 'Prácticas',
}

function isActive(c: Contract) {
  const now = new Date()
  const start = new Date(c.start_date)
  const end = c.end_date ? new Date(c.end_date) : null
  return start <= now && (!end || end >= now)
}

function SignBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === 'not_sent') return null
  if (status === 'signed') return (
    <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
      <PenLine className="w-3 h-3" /> Firmado
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" /> Firma pendiente
    </span>
  )
}

function SendSignButton({ contract, onSent }: { contract: Contract; onSent: (id: string) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!contract.file_url) return (
    <span className="text-xs text-gray-300 italic">Sin archivo</span>
  )

  if (contract.signnow_status === 'signed') return null

  async function handleSend() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/hr/contracts/${contract.id}/sign`, { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error')
      onSent(contract.id)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSend}
        disabled={loading || contract.signnow_status === 'pending'}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
          contract.signnow_status === 'pending'
            ? 'text-amber-500 border-amber-200 bg-amber-50 cursor-default'
            : 'text-blue-600 border-blue-200 hover:bg-blue-50'
        }`}
      >
        {loading
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Send className="w-3 h-3" />}
        {contract.signnow_status === 'pending' ? 'Enviado' : 'Enviar a firma'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function ContractList({ contracts: initial }: { contracts: Contract[] }) {
  const [contracts, setContracts] = useState(initial)

  function markSent(id: string) {
    setContracts(prev => prev.map(c => c.id === id ? { ...c, signnow_status: 'pending' } : c))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Contratos ({contracts.length})</h2>
      </div>

      {contracts.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">
          No hay contratos registrados aún.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {contracts.map(c => {
            const active = isActive(c)
            return (
              <div key={c.id} className="px-6 py-4 flex items-start gap-4">
                <div className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${active ? 'bg-green-50' : 'bg-gray-100'}`}>
                  {active
                    ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                    : <Clock className="w-4 h-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{c.position}</p>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {CONTRACT_TYPE[c.contract_type] ?? c.contract_type}
                    </span>
                    {active && (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Vigente</span>
                    )}
                    <SignBadge status={c.signnow_status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(c.start_date).toLocaleDateString('es-PE')}
                    {' — '}
                    {c.end_date
                      ? new Date(c.end_date).toLocaleDateString('es-PE')
                      : <span className="text-green-600">Indefinido</span>}
                  </p>
                  {c.salary && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {c.currency} {c.salary.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  {c.notes && <p className="text-xs text-gray-400 mt-1">{c.notes}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  {c.file_url && (
                    <a
                      href={c.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ver contrato
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <SendSignButton contract={c} onSent={markSent} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
