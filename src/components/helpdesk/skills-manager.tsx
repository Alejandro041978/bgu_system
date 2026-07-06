'use client'

import { useState, useEffect } from 'react'
import { Loader2, Check, Shield, Circle, Users } from 'lucide-react'

interface Category { id: string; name: string }
interface Agent {
  user_id: string; full_name: string; position: string | null
  languages: string[]; topics: string[]; categories: string[]
  is_supervisor: boolean; online: boolean
}

const LANG_OPTS: [string, string][] = [['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués']]
const TOPIC_OPTS: [string, string][] = [
  ['pagos', 'Pagos'], ['notas', 'Notas'], ['admision', 'Admisión'],
  ['asistencia', 'Asistencia'], ['tramites', 'Trámites'], ['tecnico', 'Técnico'], ['otro', 'Otro'],
]

function Chips({ options, selected, onToggle }: { options: [string, string][]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([val, label]) => {
        const on = selected.includes(val)
        return (
          <button key={val} type="button" onClick={() => onToggle(val)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function SkillsManager() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/helpdesk/skills').then(r => r.json()).then(d => {
      setAgents(d.agents ?? []); setCategories(d.categories ?? []); setLoading(false)
    })
  }, [])

  function update(userId: string, patch: Partial<Agent>) {
    setAgents(prev => prev.map(a => a.user_id === userId ? { ...a, ...patch } : a))
  }
  function toggleArr(userId: string, key: 'languages' | 'topics' | 'categories', val: string) {
    setAgents(prev => prev.map(a => {
      if (a.user_id !== userId) return a
      const arr = a[key].includes(val) ? a[key].filter(x => x !== val) : [...a[key], val]
      return { ...a, [key]: arr }
    }))
  }

  async function save(a: Agent) {
    setSavingId(a.user_id); setSavedId(null)
    await fetch('/api/helpdesk/skills', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...a, agent_name: a.full_name }),
    })
    setSavingId(null); setSavedId(a.user_id)
    setTimeout(() => setSavedId(null), 2000)
  }

  if (loading) return <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
  if (agents.length === 0) return (
    <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
      <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">No hay colaboradores marcados como Equipo Helpdesk.</p>
      <p className="text-xs text-gray-400 mt-1">Marca la casilla &quot;Equipo Helpdesk&quot; en el perfil de un colaborador (Talento Humano).</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {agents.map(a => (
        <div key={a.user_id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                {a.full_name}
                {a.is_supervisor && <span className="flex items-center gap-1 text-[10px] font-medium bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full"><Shield className="w-3 h-3" /> Supervisora</span>}
                <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${a.online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  <Circle className={`w-2 h-2 ${a.online ? 'fill-green-500 text-green-500' : 'fill-gray-400 text-gray-400'}`} /> {a.online ? 'En línea' : 'Ausente'}
                </span>
              </p>
              <p className="text-xs text-gray-400">{a.position ?? ''}</p>
            </div>
            <button onClick={() => save(a)} disabled={savingId === a.user_id}
              className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {savingId === a.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedId === a.user_id ? <Check className="w-3.5 h-3.5" /> : null}
              {savedId === a.user_id ? 'Guardado' : 'Guardar'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">Idiomas <span className="text-gray-400">(vacío = todos)</span></p>
              <Chips options={LANG_OPTS} selected={a.languages} onToggle={v => toggleArr(a.user_id, 'languages', v)} />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">Temas <span className="text-gray-400">(vacío = todos)</span></p>
              <Chips options={TOPIC_OPTS} selected={a.topics} onToggle={v => toggleArr(a.user_id, 'topics', v)} />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">Categorías <span className="text-gray-400">(vacío = todas)</span></p>
              <Chips options={categories.map(c => [c.name, c.name] as [string, string])} selected={a.categories} onToggle={v => toggleArr(a.user_id, 'categories', v)} />
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={a.is_supervisor} onChange={e => update(a.user_id, { is_supervisor: e.target.checked })} className="rounded border-gray-300" />
              Supervisora (recibe el triage de lo no clasificable)
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={a.online} onChange={e => update(a.user_id, { online: e.target.checked })} className="rounded border-gray-300" />
              En línea (recibe asignaciones automáticas)
            </label>
          </div>
        </div>
      ))}
    </div>
  )
}
