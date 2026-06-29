'use client'

import { useState } from 'react'
import { CheckCircle2, Clock, FileText, ChevronDown, ChevronUp, Monitor, Calendar, Download, Loader2, Briefcase, DollarSign, AlertTriangle } from 'lucide-react'

type Instance = {
  id: string
  status: 'pending' | 'signed' | 'expired' | 'cancelled'
  created_at: string
  signed_at: string | null
  ip_address: string | null
  token: string
  pdf_url: string | null
  template: { name: string } | null
  position: string | null
  start_date: string | null
  end_date: string | null
  salary: number | null
  currency: string | null
}

function GeneratePdfButton({ instanceId, onGenerated }: { instanceId: string; onGenerated: (url: string) => void }) {
  const [loading, setLoading] = useState(false)
  async function generate() {
    setLoading(true)
    try {
      const res = await fetch(`/api/contracts/instances/${instanceId}/pdf`, { method: 'POST' })
      const data = await res.json() as { pdf_url?: string }
      if (data.pdf_url) onGenerated(data.pdf_url)
    } finally { setLoading(false) }
  }
  return (
    <button onClick={generate} disabled={loading}
      className="inline-flex items-center gap-2 bg-white border border-green-300 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50">
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {loading ? 'Generando...' : 'Generar PDF'}
    </button>
  )
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
  })
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const end = new Date(iso.split('T')[0])
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - today.getTime()) / 86400000)
}

export function EmployeeContractsSigned({ instances: initial }: { instances: Instance[] }) {
  const [instances, setInstances] = useState(initial)
  const [expanded, setExpanded] = useState<string | null>(null)

  function handlePdfGenerated(id: string, url: string) {
    setInstances(prev => prev.map(i => i.id === id ? { ...i, pdf_url: url } : i))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Contratos digitales ({instances.length})</h2>
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {instances.filter(i => i.status === 'signed').length} firmados</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-500" /> {instances.filter(i => i.status === 'pending').length} pendientes</span>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No hay contratos digitales enviados.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {instances.map(inst => {
            const signed = inst.status === 'signed'
            const isOpen = expanded === inst.id
            const days = daysUntil(inst.end_date)
            const expiring = days !== null && days >= 0 && days <= 30
            const expired = days !== null && days < 0

            return (
              <div key={inst.id}>
                <div
                  className="px-6 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : inst.id)}
                >
                  <div className={`p-1.5 rounded-lg ${signed ? 'bg-green-50' : 'bg-amber-50'}`}>
                    {signed ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{inst.template?.name ?? 'Contrato'}</p>
                    {inst.position && (
                      <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                        <Briefcase className="w-3 h-3 text-gray-400" />{inst.position}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {inst.start_date && <p className="text-xs text-gray-400">Inicio: {fmtDate(inst.start_date)}</p>}
                      {inst.end_date && (
                        <p className={`text-xs flex items-center gap-1 ${expiring ? 'text-amber-600 font-medium' : expired ? 'text-red-500' : 'text-gray-400'}`}>
                          {(expiring || expired) && <AlertTriangle className="w-3 h-3" />}
                          Vence: {fmtDate(inst.end_date)}{expiring ? ` (${days}d)` : expired ? ' (vencido)' : ''}
                        </p>
                      )}
                      {!inst.end_date && inst.start_date && <p className="text-xs text-gray-400">Plazo indefinido</p>}
                      {inst.salary && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <DollarSign className="w-3 h-3 text-gray-400" />
                          {inst.currency ?? 'PEN'} {inst.salary.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {signed ? `Firmado: ${fmt(inst.signed_at)}` : `Enviado: ${fmt(inst.created_at)} · Pendiente`}
                    </p>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {isOpen && signed && (
                  <div className="px-6 pb-4 pt-2 bg-green-50 border-t border-green-100">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Evidencia de firma</p>
                    <div className="flex flex-col gap-1.5 mb-3">
                      <div className="flex items-center gap-2 text-xs text-gray-700">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>Firmado el {fmt(inst.signed_at)} (Lima, PE)</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-700">
                        <Monitor className="w-3.5 h-3.5 text-gray-400" />
                        <span>IP: {inst.ip_address ?? '—'}</span>
                      </div>
                    </div>
                    {inst.pdf_url ? (
                      <a href={inst.pdf_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-white border border-green-300 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors">
                        <Download className="w-3.5 h-3.5" /> Descargar PDF firmado
                      </a>
                    ) : (
                      <GeneratePdfButton instanceId={inst.id} onGenerated={(url) => handlePdfGenerated(inst.id, url)} />
                    )}
                  </div>
                )}

                {isOpen && !signed && (
                  <div className="px-6 pb-3 pt-2 bg-amber-50 border-t border-amber-100">
                    <p className="text-xs text-amber-700">
                      Enlace de firma:{' '}
                      <a href={`/sign/${inst.token}`} target="_blank" rel="noopener noreferrer" className="underline font-mono">
                        /sign/{inst.token.slice(0, 8)}...
                      </a>
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
