'use client'

import { useState, useEffect } from 'react'
import { Loader2, Phone, Mail, GraduationCap, RefreshCw } from 'lucide-react'

interface Lead {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  program_interest: string | null
  prior_studies: string | null
  stage: string
  qualified: boolean | null
  notes: string | null
  updated_at: string
  last_contact_at: string | null
}

const STAGES = [
  { key: 'contactable', label: 'Contactable', color: 'bg-sky-100 text-sky-700' },
  { key: 'calificado', label: 'Calificado', color: 'bg-violet-100 text-violet-700' },
  { key: 'interesado', label: 'Interesado', color: 'bg-amber-100 text-amber-700' },
  { key: 'inscrito', label: 'Inscrito', color: 'bg-green-100 text-green-700' },
  { key: 'descartado', label: 'Descartado', color: 'bg-gray-100 text-gray-500' },
  { key: 'nuevo', label: 'Nuevo', color: 'bg-gray-100 text-gray-500' },
]

function stageStyle(stage: string) {
  return STAGES.find(s => s.key === stage)?.color ?? 'bg-gray-100 text-gray-500'
}
function stageLabel(stage: string) {
  return STAGES.find(s => s.key === stage)?.label ?? stage
}
function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
}

export function SalesLeadsView() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)

  async function load(stageFilter: string) {
    setLoading(true)
    setFilter(stageFilter)
    const res = await fetch(`/api/sales/leads${stageFilter ? `?stage=${stageFilter}` : ''}`)
    const data = await res.json()
    setLeads(data.leads ?? [])
    setCounts(data.counts ?? {})
    setLoading(false)
  }

  // Carga inicial: setState solo dentro del callback asíncrono (no síncrono en el efecto)
  useEffect(() => {
    fetch('/api/sales/leads')
      .then(r => r.json())
      .then(data => {
        setLeads(data.leads ?? [])
        setCounts(data.counts ?? {})
        setLoading(false)
      })
  }, [])

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  async function changeStage(id: string, stage: string) {
    await fetch('/api/sales/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, stage }),
    })
    await load(filter)
  }

  return (
    <div className="space-y-4">
      {/* Resumen de etapas */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => load('')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${filter === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          Todos <span className="opacity-70">({total})</span>
        </button>
        {STAGES.filter(s => s.key !== 'nuevo' || counts['nuevo']).map(s => (
          <button
            key={s.key}
            onClick={() => load(s.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${filter === s.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {s.label} <span className="opacity-70">({counts[s.key] ?? 0})</span>
          </button>
        ))}
        <button onClick={() => load(filter)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          No hay prospectos en esta etapa todavía.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Prospecto</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Programa</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Estudios previos</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Etapa</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Últim. contacto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map(l => (
                <tr key={l.id} className="hover:bg-gray-50/50 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{l.name ?? 'Sin nombre'}</p>
                    <div className="text-xs text-gray-400 space-y-0.5 mt-0.5">
                      {l.phone && !l.phone.startsWith('web:') && <p className="flex items-center gap-1"><Phone className="w-3 h-3" />{l.phone}</p>}
                      {l.email && <p className="flex items-center gap-1"><Mail className="w-3 h-3" />{l.email}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{l.program_interest ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px]">
                    <span className="flex items-start gap-1"><GraduationCap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{l.prior_studies ?? '—'}</span>
                    {l.qualified === true && <span className="text-green-600 text-xs">✓ Califica</span>}
                    {l.qualified === false && <span className="text-red-500 text-xs">✗ No califica</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={l.stage}
                      onChange={e => changeStage(l.id, e.target.value)}
                      className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 cursor-pointer ${stageStyle(l.stage)}`}
                    >
                      {STAGES.map(s => <option key={s.key} value={s.key}>{stageLabel(s.key)}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmt(l.last_contact_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
