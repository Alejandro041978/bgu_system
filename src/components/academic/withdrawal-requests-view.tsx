'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Phone, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'

type Row = {
  id: string; student_id: string; origin: string; requested_at: string
  requested_type: string | null; reason: string | null; objection: string | null
  inactivity_days: number | null; balance: number | null
  stage: string; call_notes: string | null; outcome: string | null
  student_name: string; document_number: string | null; phone: string | null
}
type Data = { rows: Row[]; stages: Record<string, number>; outcomes: Record<string, number> }

const STAGE: Record<string, { label: string; cls: string }> = {
  solicitado:        { label: 'Solicitado',        cls: 'bg-gray-100 text-gray-600' },
  llamada_pendiente: { label: 'Llamada pendiente', cls: 'bg-amber-50 text-amber-700' },
  llamada_realizada: { label: 'Llamada hecha',     cls: 'bg-blue-50 text-blue-700' },
  resuelto:          { label: 'Resuelto',          cls: 'bg-green-50 text-green-700' },
  anulado:           { label: 'Anulado',           cls: 'bg-gray-100 text-gray-400' },
}
const OUTCOME: Record<string, { label: string; cls: string }> = {
  revertido:         { label: '✓ Revertido (se queda)', cls: 'bg-green-50 text-green-700' },
  LOA:               { label: 'LOA · temporal',         cls: 'bg-orange-50 text-orange-700' },
  IW_voluntario:     { label: 'IW voluntario',          cls: 'bg-rose-50 text-rose-700' },
  IW_administrativo: { label: 'IW administrativo',      cls: 'bg-rose-50 text-rose-700' },
}
const OBJECTION: Record<string, string> = {
  deuda: 'Deuda', tiempo: 'Tiempo / trabajo', salud: 'Salud / personal',
  dificultad: 'Dificultad académica', acceso: 'No puede entrar al aula',
}
const money = (n: number | null) => n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const fdate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export function WithdrawalRequestsView() {
  const [data, setData] = useState<Data | null>(null)
  const [stage, setStage] = useState('llamada_pendiente')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await fetch(`/api/academic/withdrawal-requests${stage ? `?stage=${stage}` : ''}`).then(r => r.json())
    setData(d); setLoading(false)
  }, [stage])
  useEffect(() => { load() }, [load])

  async function resolve(r: Row, outcome: string) {
    const etiqueta = OUTCOME[outcome].label
    if (!confirm(`Resultado para ${r.student_name}: ${etiqueta}\n\n${outcome === 'revertido'
      ? 'No se generará ningún retiro; el estudiante se queda.'
      : 'Se generará el retiro con su número de resolución automáticamente.'}\n\n¿Confirmas?`)) return
    setSaving(true)
    const res = await fetch(`/api/academic/withdrawal-requests/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, call_notes: notes || r.call_notes }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { alert(d.error ?? 'No se pudo resolver'); return }
    setOpen(null); setNotes(''); load()
  }

  const stages = data?.stages ?? {}
  const outcomes = data?.outcomes ?? {}
  const revertidos = outcomes.revertido ?? 0
  const totalResueltos = Object.values(outcomes).reduce((a, b) => a + b, 0)
  const tasa = totalResueltos ? Math.round(revertidos / totalResueltos * 100) : 0

  return (
    <div className="space-y-4">
      {/* La métrica que importa: cuántos se quedaron */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <p className="text-[11px] text-green-700 uppercase tracking-wide">Retención lograda</p>
          <p className="text-2xl font-bold text-green-800">{revertidos}</p>
          <p className="text-[11px] text-green-600">{tasa}% de los resueltos</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-[11px] text-amber-700 uppercase tracking-wide">Llamadas pendientes</p>
          <p className="text-2xl font-bold text-amber-800">{stages.llamada_pendiente ?? 0}</p>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
          <p className="text-[11px] text-rose-700 uppercase tracking-wide">Terminaron en retiro</p>
          <p className="text-2xl font-bold text-rose-800">{(outcomes.LOA ?? 0) + (outcomes.IW_voluntario ?? 0) + (outcomes.IW_administrativo ?? 0)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total expedientes</p>
          <p className="text-2xl font-bold text-gray-800">{Object.values(stages).reduce((a, b) => a + b, 0)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[['llamada_pendiente', 'Llamada pendiente'], ['llamada_realizada', 'Llamada hecha'], ['resuelto', 'Resueltos'], ['', 'Todos']].map(([k, l]) => (
          <button key={k} onClick={() => setStage(k)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${stage === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {l} {k && <span className="opacity-70">({stages[k] ?? 0})</span>}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : data.rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">Sin expedientes en esta etapa.</p>
      ) : (
        <div className="space-y-2">
          {data.rows.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-4 flex items-start justify-between gap-4 cursor-pointer hover:bg-gray-50/50"
                onClick={() => { setOpen(open === r.id ? null : r.id); setNotes(r.call_notes ?? '') }}>
                <div className="min-w-0">
                  <p className="text-gray-800 font-medium">{r.student_name || 'Estudiante'}</p>
                  <div className="text-[11px] text-gray-400 flex flex-wrap gap-2 mt-0.5">
                    <span>{r.document_number}</span>
                    {r.phone && <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" />{r.phone}</span>}
                    <span>Solicitó: {fdate(r.requested_at)}</span>
                    {r.origin === 'bot' && <span className="text-blue-500">vía Camila</span>}
                  </div>
                  {r.reason && <p className="text-xs text-gray-500 mt-1 italic">“{r.reason}”</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex gap-1">
                    {r.requested_type && <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">Pide {r.requested_type}</span>}
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STAGE[r.stage]?.cls}`}>{STAGE[r.stage]?.label ?? r.stage}</span>
                  </div>
                  {r.outcome && <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${OUTCOME[r.outcome]?.cls}`}>{OUTCOME[r.outcome]?.label}</span>}
                </div>
              </div>

              {open === r.id && (
                <div className="border-t border-gray-100 bg-gray-50/60 p-4 space-y-3">
                  {/* Lo que el humano necesita saber ANTES de llamar */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white border border-gray-200 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-400 uppercase flex items-center gap-1"><Clock className="w-3 h-3" />Sin entrar al aula</p>
                      <p className="text-lg font-semibold text-gray-800">{r.inactivity_days ?? '—'} días</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-400 uppercase flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Saldo</p>
                      <p className={`text-lg font-semibold ${(r.balance ?? 0) > 0 ? 'text-red-600' : 'text-gray-800'}`}>{money(r.balance)}</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-400 uppercase">Traba detectada</p>
                      <p className="text-sm font-semibold text-gray-800 mt-1">{r.objection ? (OBJECTION[r.objection] ?? r.objection) : '—'}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Resultado del diálogo</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                      placeholder="Qué dijo, qué se le explicó, a qué se comprometió…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {r.stage !== 'resuelto' ? (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1.5">Marcar resultado de la llamada:</p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => resolve(r, 'revertido')} disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white">
                          <CheckCircle2 className="w-4 h-4" /> Se queda (revertido)
                        </button>
                        <button onClick={() => resolve(r, 'LOA')} disabled={saving}
                          className="px-3 py-2 text-sm font-medium rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-50">
                          LOA · temporal
                        </button>
                        <button onClick={() => resolve(r, 'IW_voluntario')} disabled={saving}
                          className="px-3 py-2 text-sm font-medium rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                          IW voluntario
                        </button>
                        <button onClick={() => resolve(r, 'IW_administrativo')} disabled={saving}
                          className="px-3 py-2 text-sm font-medium rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                          IW administrativo
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1.5">Al marcar LOA o IW se genera el retiro con su número de resolución. «Se queda» no genera ningún retiro.</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Expediente resuelto{r.outcome ? `: ${OUTCOME[r.outcome]?.label}` : ''}.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
