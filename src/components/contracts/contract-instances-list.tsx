'use client'

import { useState } from 'react'
import { CheckCircle2, Clock, XCircle, FileText, User, Calendar, Monitor } from 'lucide-react'

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
  template: { name: string } | null
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

export function ContractInstancesList({ instances }: { instances: Instance[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
