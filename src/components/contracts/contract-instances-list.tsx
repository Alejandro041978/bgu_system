'use client'

import { useState } from 'react'
import { CheckCircle2, Clock, XCircle, FileText, User, Calendar, Monitor, Download, Loader2, Briefcase, DollarSign, AlertTriangle } from 'lucide-react'

type Instance = {
  id: string
  signer_name: string
  signer_email: string
  signer_type: string
  status: 'pending' | 'signed' | 'expired' | 'cancelled'
  created_at: string
  signed_at: string | null
  ip_address: string | null
  user_agent: string | null
  token: string
  pdf_url: string | null
  template: { name: string } | null
  position: string | null
  start_date: string | null
  end_date: string | null
  salary: number | null
  currency: string | null
}

const STATUS = {
  pending:   { label: 'Pendiente',  color: 'bg-amber-100 text-amber-700 border-amber-200',  Icon: Clock },
  signed:    { label: 'Firmado',    color: 'bg-green-100 text-green-700 border-green-200',   Icon: CheckCircle2 },
  expired:   { label: 'Expirado',   color: 'bg-gray-100 text-gray-500 border-gray-200',      Icon: XCircle },
  cancelled: { label: 'Cancelado',  color: 'bg-red-100 text-red-600 border-red-200',         Icon: XCircle },
}

const SIGNER_TYPE: Record<string, string> = {
  employee: 'Colaborador',
  teacher: 'Docente',
  student: 'Estudiante',
  other: 'Otro',
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Lima',
  })
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  // date-only: YYYY-MM-DD, show as DD/MM/YYYY
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const end = new Date(iso.split('T')[0])
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.ceil((end.getTime() - today.getTime()) / 86400000)
}

function GeneratePdfButton({ instanceId, onGenerated }: { instanceId: string; onGenerated: (url: string) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/instances/${instanceId}/pdf`, { method: 'POST' })
      const data = await res.json() as { ok?: boolean; pdf_url?: string; error?: string }
      if (!res.ok) throw new Error(data.error)
      onGenerated(data.pdf_url!)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-white border border-green-300 text-green-700 text-xs font-semibold px-4 py-2 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {loading ? 'Generando PDF...' : 'Generar PDF'}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}

export function ContractInstancesList({ instances: initial }: { instances: Instance[] }) {
  const [instances, setInstances] = useState(initial)
  const [expanded, setExpanded] = useState<string | null>(null)

  function handlePdfGenerated(id: string, url: string) {
    setInstances(prev => prev.map(i => i.id === id ? { ...i, pdf_url: url } : i))
  }

  if (instances.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No se han enviado contratos aún.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Contratos enviados ({instances.length})</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {instances.filter(i => i.status === 'signed').length} firmados</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-500" /> {instances.filter(i => i.status === 'pending').length} pendientes</span>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {instances.map(inst => {
          const s = STATUS[inst.status] ?? STATUS.pending
          const isOpen = expanded === inst.id
          return (
            <div key={inst.id}>
              <div
                className="px-6 py-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(isOpen ? null : inst.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{inst.signer_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${s.color} flex items-center gap-1`}>
                      <s.Icon className="w-3 h-3" /> {s.label}
                    </span>
                    <span className="text-xs text-gray-400">{SIGNER_TYPE[inst.signer_type] ?? inst.signer_type}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{inst.signer_email}</p>
                  {inst.template && (
                    <p className="text-xs text-blue-600 mt-0.5">{inst.template.name}</p>
                  )}
                  {inst.position && (
                    <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                      <Briefcase className="w-3 h-3 text-gray-400" />{inst.position}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {inst.start_date && (
                      <p className="text-xs text-gray-400">Inicio: {fmtDate(inst.start_date)}</p>
                    )}
                    {inst.end_date && (() => {
                      const days = daysUntil(inst.end_date)
                      const expiring = days !== null && days >= 0 && days <= 30
                      const expired = days !== null && days < 0
                      return (
                        <p className={`text-xs flex items-center gap-1 ${expiring ? 'text-amber-600 font-medium' : expired ? 'text-red-500' : 'text-gray-400'}`}>
                          {(expiring || expired) && <AlertTriangle className="w-3 h-3" />}
                          Vence: {fmtDate(inst.end_date)}{expiring ? ` (${days}d)` : expired ? ' (vencido)' : ''}
                        </p>
                      )
                    })()}
                    {!inst.end_date && inst.start_date && <p className="text-xs text-gray-400">Plazo indefinido</p>}
                    {inst.salary && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <DollarSign className="w-3 h-3 text-gray-400" />
                        {inst.currency ?? 'PEN'} {inst.salary.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Enviado: {fmt(inst.created_at)}</p>
                </div>
                {inst.status === 'signed' && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-green-600 font-medium">Firmado</p>
                    <p className="text-xs text-gray-400">{fmt(inst.signed_at)}</p>
                  </div>
                )}
              </div>

              {isOpen && inst.status === 'signed' && (
                <div className="px-6 pb-4 bg-green-50 border-t border-green-100">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3 pt-3">Evidencia de firma</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <div className="flex items-start gap-2">
                      <User className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Firmante</p>
                        <p className="text-xs font-medium text-gray-800">{inst.signer_name}</p>
                        <p className="text-xs text-gray-500">{inst.signer_email}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Calendar className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Fecha y hora</p>
                        <p className="text-xs font-medium text-gray-800">{fmt(inst.signed_at)}</p>
                        <p className="text-xs text-gray-500">Lima, Perú</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Monitor className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">IP registrada</p>
                        <p className="text-xs font-medium text-gray-800">{inst.ip_address ?? '—'}</p>
                      </div>
                    </div>
                  </div>
                  {inst.pdf_url ? (
                    <a
                      href={inst.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-white border border-green-300 text-green-700 text-xs font-semibold px-4 py-2 rounded-lg hover:bg-green-50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Descargar PDF firmado
                    </a>
                  ) : (
                    <GeneratePdfButton instanceId={inst.id} onGenerated={(url) => handlePdfGenerated(inst.id, url)} />
                  )}
                </div>
              )}

              {isOpen && inst.status === 'pending' && (
                <div className="px-6 pb-4 pt-2 bg-amber-50 border-t border-amber-100">
                  <p className="text-xs text-amber-700">
                    Enlace de firma:{' '}
                    <a
                      href={`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/sign/${inst.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-mono break-all"
                    >
                      /sign/{inst.token}
                    </a>
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
