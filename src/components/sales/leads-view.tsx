'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Phone, Mail, GraduationCap, RefreshCw } from 'lucide-react'

interface Lead {
  id: string; name: string | null; phone: string | null; email: string | null
  program_interest: string | null; prior_studies: string | null; stage: string
  qualified: boolean | null; notes: string | null; updated_at: string; last_contact_at: string | null
  funnel_id: string | null; convocatoria_id: string | null
}
interface Bot { key: string; name: string }
interface Funnel { id: string; bot_key: string; name: string; scope_category_id: string | null; scope_program_ids: string[]; sort_order: number }
interface Convocatoria { id: string; name: string; product_category_id: string | null }

const STAGES = [
  { key: 'contactable', label: 'Contactable', color: 'bg-sky-100 text-sky-700' },
  { key: 'calificado', label: 'Calificado', color: 'bg-violet-100 text-violet-700' },
  { key: 'interesado', label: 'Interesado', color: 'bg-amber-100 text-amber-700' },
  { key: 'inscrito', label: 'Inscrito', color: 'bg-green-100 text-green-700' },
  { key: 'descartado', label: 'Descartado', color: 'bg-gray-100 text-gray-500' },
  { key: 'nuevo', label: 'Nuevo', color: 'bg-gray-100 text-gray-500' },
]
const stageStyle = (s: string) => STAGES.find(x => x.key === s)?.color ?? 'bg-gray-100 text-gray-500'
const stageLabel = (s: string) => STAGES.find(x => x.key === s)?.label ?? s
const fmt = (d: string | null) => d ? new Date(d).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export function SalesLeadsView() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [bots, setBots] = useState<Bot[]>([])
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [convocatorias, setConvocatorias] = useState<Convocatoria[]>([])
  const [bot, setBot] = useState('antonella')
  const [funnel, setFunnel] = useState('')
  const [stage, setStage] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ bot }); if (funnel) p.set('funnel', funnel); if (stage) p.set('stage', stage)
    const d = await fetch(`/api/sales/leads?${p}`).then(r => r.json())
    setLeads(d.leads ?? []); setCounts(d.counts ?? {}); setBots(d.bots ?? []); setFunnels(d.funnels ?? []); setConvocatorias(d.convocatorias ?? [])
    setLoading(false)
  }, [bot, funnel, stage])
  useEffect(() => { load() }, [load])

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const botFunnels = funnels.filter(f => f.bot_key === bot).sort((a, b) => a.sort_order - b.sort_order)
  const funnelById = new Map(funnels.map(f => [f.id, f]))

  async function patch(body: Record<string, unknown>) {
    const d = await fetch('/api/sales/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())
    if (d.error === 'convocatoria_required') { alert('Asigna una convocatoria al prospecto antes de marcarlo como «Inscrito» (ahí inicia el proceso de admisión/matrícula).'); return }
    if (d.error) { alert(d.error); return }
    await load()
  }

  // Convocatorias válidas para un lead: las de la categoría de su embudo (si tiene), o todas.
  function convOptions(l: Lead): Convocatoria[] {
    const f = l.funnel_id ? funnelById.get(l.funnel_id) : null
    if (f?.scope_category_id) return convocatorias.filter(c => c.product_category_id === f.scope_category_id)
    return convocatorias
  }

  return (
    <div className="space-y-4">
      {/* Bots */}
      <div className="flex flex-wrap gap-2">
        {bots.map(b => (
          <button key={b.key} onClick={() => { setBot(b.key); setFunnel(''); setStage('') }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border ${bot === b.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {b.name}
          </button>
        ))}
      </div>

      {/* Embudos del bot */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setFunnel(''); setStage('') }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${funnel === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          Todos los embudos
        </button>
        {botFunnels.map(f => (
          <button key={f.id} onClick={() => { setFunnel(f.id); setStage('') }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${funnel === f.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {f.name}
          </button>
        ))}
        {botFunnels.length === 0 && <span className="text-xs text-amber-600 self-center">Este bot no tiene embudos. Créalos en «Configuración de embudos».</span>}
      </div>

      {/* Etapas */}
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <button onClick={() => setStage('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${stage === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          Todos <span className="opacity-70">({total})</span>
        </button>
        {STAGES.filter(s => s.key !== 'nuevo' || counts['nuevo']).map(s => (
          <button key={s.key} onClick={() => setStage(s.key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${stage === s.key ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {s.label} <span className="opacity-70">({counts[s.key] ?? 0})</span>
          </button>
        ))}
        <button onClick={load} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50"><RefreshCw className="w-3.5 h-3.5" />Actualizar</button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">No hay prospectos aquí todavía.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                <th className="text-left px-4 py-2.5">Prospecto</th>
                <th className="text-left px-4 py-2.5">Programa</th>
                <th className="text-left px-4 py-2.5">Etapa</th>
                <th className="text-left px-4 py-2.5">Embudo</th>
                <th className="text-left px-4 py-2.5">Convocatoria</th>
                <th className="text-left px-4 py-2.5">Últ. contacto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map(l => {
                const needsConv = l.stage === 'interesado' && !l.convocatoria_id
                return (
                  <tr key={l.id} className="hover:bg-gray-50/50 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{l.name ?? 'Sin nombre'}</p>
                      <div className="text-xs text-gray-400 space-y-0.5 mt-0.5">
                        {l.phone && !l.phone.startsWith('web:') && <p className="flex items-center gap-1"><Phone className="w-3 h-3" />{l.phone}</p>}
                        {l.email && <p className="flex items-center gap-1"><Mail className="w-3 h-3" />{l.email}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {l.program_interest ?? '—'}
                      {l.qualified === true && <span className="block text-green-600 text-xs mt-0.5"><GraduationCap className="w-3 h-3 inline" /> Califica</span>}
                      {l.qualified === false && <span className="block text-red-500 text-xs mt-0.5">✗ No califica</span>}
                    </td>
                    <td className="px-4 py-3">
                      <select value={l.stage} onChange={e => patch({ id: l.id, stage: e.target.value })}
                        className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 cursor-pointer ${stageStyle(l.stage)}`}>
                        {STAGES.map(s => <option key={s.key} value={s.key}>{stageLabel(s.key)}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select value={l.funnel_id ?? ''} onChange={e => patch({ id: l.id, funnel_id: e.target.value || null })} className={sel}>
                        <option value="">— Sin embudo —</option>
                        {botFunnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select value={l.convocatoria_id ?? ''} onChange={e => patch({ id: l.id, convocatoria_id: e.target.value || null })}
                        className={`${sel} ${needsConv ? 'ring-2 ring-amber-400' : ''}`}>
                        <option value="">{needsConv ? '⚠ Asignar…' : '— Sin convocatoria —'}</option>
                        {convOptions(l).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmt(l.last_contact_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const sel = 'text-xs rounded-lg border border-gray-200 px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[180px]'
