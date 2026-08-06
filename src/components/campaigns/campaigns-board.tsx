'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Megaphone, Power, Users } from 'lucide-react'

interface Campaign {
  key: string; name: string; description: string | null
  priority: number; cooldown_days: number; active: boolean; legacy?: boolean
  eligible: number; sample: { student_id: string; name: string; reason: string }[]
  sent_30d: number; converted_30d: number; failed_30d?: number
}

export function CampaignsBoard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [meta, setMeta] = useState<{ optouts: number; en_cooldown: number; total_asignados: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch('/api/campaigns').then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setCampaigns(d.campaigns ?? [])
    setMeta({ optouts: d.optouts ?? 0, en_cooldown: d.en_cooldown ?? 0, total_asignados: d.total_asignados ?? 0 })
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function patch(key: string, body: Record<string, unknown>) {
    const d = await fetch('/api/campaigns', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, ...body }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load()
  }

  if (loading) return <p className="text-center text-gray-400 py-10 text-sm">Resolviendo elegibilidad en vivo…</p>

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {meta && (
        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{meta.total_asignados} estudiante(s) elegibles hoy (una campaña c/u)</span>
          <span>· {meta.en_cooldown} en cooldown global</span>
          <span>· {meta.optouts} con opt-out universal</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {campaigns.map(c => (
          <div key={c.key} className={`bg-white border rounded-xl p-4 space-y-3 ${c.legacy ? 'border-amber-200 bg-amber-50/20' : c.active ? 'border-green-200' : 'border-gray-200 opacity-80'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Megaphone className={`w-4 h-4 ${c.active ? 'text-green-600' : 'text-gray-300'}`} />
                  {c.name}
                  <span className="text-[10px] font-normal text-gray-400">prioridad {c.priority}</span>
                  {c.legacy && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">OLD · modelo anterior</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>
              </div>
              {c.legacy ? (
                <span title="Se controla desde su propia página de Retención" className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium ${c.active ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  <Power className="w-3.5 h-3.5" />{c.active ? 'Activa' : 'Apagada'}
                </span>
              ) : (
              <button onClick={() => patch(c.key, { active: !c.active })}
                title={c.active ? 'Apagar campaña' : 'Encender campaña'}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium ${c.active ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                <Power className="w-3.5 h-3.5" />{c.active ? 'Activa' : 'Apagada'}
              </button>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs">
              <span className="bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 font-semibold tabular-nums">{c.eligible} elegibles hoy</span>
              <span className="text-gray-400 tabular-nums">{c.sent_30d} contactados (30d) · {c.converted_30d} convertidos</span>
              {/* Un envío fallido no es un contacto, y callarlo fue lo que dejó
                  a Camila una semana sin entregar un mensaje sin que se notara. */}
              {!!c.failed_30d && (
                <span className="text-red-600 bg-red-50 rounded-full px-2 py-0.5 tabular-nums" title="Intentos que Twilio rechazó">
                  {c.failed_30d} fallidos
                </span>
              )}
              <label className="ml-auto flex items-center gap-1.5 text-gray-400">
                cooldown
                <input defaultValue={c.cooldown_days} disabled={c.legacy} onBlur={e => { const v = Number(e.target.value); if (v && v !== c.cooldown_days) patch(c.key, { cooldown_days: v }) }}
                  inputMode="numeric" className="w-12 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center disabled:bg-gray-50 disabled:text-gray-400" />
                días
              </label>
            </div>

            {c.sample.length > 0 && (
              <div className="border-t border-gray-50 pt-2">
                <p className="text-[10px] uppercase text-gray-400 mb-1">Muestra</p>
                {c.sample.map(s => (
                  <p key={s.student_id} className="text-xs text-gray-600 truncate">
                    <a href={`/academic/students?id=${s.student_id}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">{s.name}</a>
                    <span className="text-gray-400"> — {s.reason}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400">
        Un estudiante pertenece a UNA campaña a la vez (por prioridad). El cooldown es GLOBAL entre campañas y el
        opt-out es universal. Las campañas nacen apagadas: encenderlas aquí solo habilita la elegibilidad — el envío
        de mensajes (Micaela) se conecta en la siguiente fase.
      </p>
    </div>
  )
}
