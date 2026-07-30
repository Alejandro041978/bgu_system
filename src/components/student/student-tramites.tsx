'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Loader2, X, ClipboardList, CheckCircle2 } from 'lucide-react'

interface TramiteType {
  id: string; name: string; description: string | null
  price: number; currency: string
  request_note_label: string | null; instructions: string | null
}
interface Request {
  id: string; status: string; requested_at: string; paid_at: string | null
  attended_at: string | null; resolution_note: string | null; request_note: string | null
  type_name: string; price: number; currency: string
}

// Los cuatro estados del circuito, en el lenguaje del estudiante: a él no le
// dice nada "iniciado", le dice qué le toca hacer.
const STATUS: Record<string, { label: string; cls: string; ayuda?: string }> = {
  iniciado: { label: 'Pendiente de pago', cls: 'bg-amber-50 text-amber-700', ayuda: 'Paga la cuota en tu estado de cuenta y el trámite entra en atención.' },
  pagado: { label: 'En atención', cls: 'bg-blue-50 text-blue-700', ayuda: 'Ya recibimos tu pago. Registros lo está atendiendo.' },
  atendido: { label: 'Atendido', cls: 'bg-green-100 text-green-800' },
  anulado: { label: 'Anulado', cls: 'bg-gray-100 text-gray-500' },
}
const fdate = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const money = (n: number, c: string) => `${c} ${Number(n).toFixed(2)}`

export function StudentTramites() {
  const [types, setTypes] = useState<TramiteType[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [typeId, setTypeId] = useState('')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const d = await fetch('/api/student/tramites').then(r => r.json())
    setTypes(d.types ?? []); setRequests(d.requests ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const selected = types.find(t => t.id === typeId)
  const noteMissing = !!selected?.request_note_label && !note.trim()

  async function crear() {
    if (!typeId || noteMissing) return
    setCreating(true); setMsg(null)
    const res = await fetch('/api/student/tramites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tramite_type_id: typeId, request_note: note.trim() || null }),
    })
    const d = await res.json()
    setCreating(false); setConfirming(false)
    if (!res.ok) { setMsg({ ok: false, text: d.error ?? 'No se pudo solicitar' }); return }
    setMsg({
      ok: true,
      text: d.status === 'iniciado'
        ? 'Trámite solicitado. Se generó la cuota en tu estado de cuenta; al pagarla entra en atención.'
        : 'Trámite solicitado y en atención.',
    })
    setOpen(false); setTypeId(''); setNote('')
    load()
  }

  if (loading) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!open && (
          <button onClick={() => { setOpen(true); setMsg(null) }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4" />Solicitar trámite
          </button>
        )}
      </div>

      {msg && (
        <p className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</p>
      )}

      {open && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Solicitar trámite</h3>
            <button onClick={() => { setOpen(false); setTypeId(''); setNote(''); setConfirming(false) }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Trámite</span>
            <select value={typeId} onChange={e => { setTypeId(e.target.value); setConfirming(false) }} className={inp}>
              <option value="">Seleccionar…</option>
              {types.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{Number(t.price) > 0 ? ` — ${money(t.price, t.currency)}` : ' — sin costo'}
                </option>
              ))}
            </select>
          </label>

          {selected && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-600 space-y-1">
              {selected.description && <p>{selected.description}</p>}
              {selected.instructions && <p className="text-gray-500">{selected.instructions}</p>}
            </div>
          )}

          {selected?.request_note_label && (
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">{selected.request_note_label} <span className="text-red-500">*</span></span>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          )}

          {/* Se avisa del cargo ANTES de crearlo: el estudiante no debería
              descubrir una cuota nueva en su estado de cuenta. */}
          {confirming && selected && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-2">
              <p className="font-medium">⚠️ Se generará una cuota por pagar</p>
              <p>Al solicitar este trámite se cargará <strong>{money(selected.price, selected.currency)}</strong> en tu estado de cuenta. Se atiende una vez pagado. ¿Continuar?</p>
              <div className="flex gap-2 pt-0.5">
                <button onClick={crear} disabled={creating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Confirmar
                </button>
                <button onClick={() => setConfirming(false)} disabled={creating}
                  className="px-3 py-1.5 font-medium rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
              </div>
            </div>
          )}

          {!confirming && (
            <button onClick={() => { if (Number(selected?.price ?? 0) > 0) setConfirming(true); else crear() }}
              disabled={!typeId || noteMissing || creating}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Solicitar
            </button>
          )}
        </div>
      )}

      {requests.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">Aún no has solicitado trámites.</p>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <ClipboardList className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{r.type_name}</p>
                    <p className="text-xs text-gray-400">
                      Solicitado el {fdate(r.requested_at)}
                      {Number(r.price) > 0 ? ` · ${money(r.price, r.currency)}` : ''}
                    </p>
                    {r.request_note && <p className="text-xs text-gray-500 mt-1 italic">“{r.request_note}”</p>}
                  </div>
                </div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS[r.status]?.label ?? r.status}
                </span>
              </div>
              {STATUS[r.status]?.ayuda && (
                <p className="text-[11.5px] text-gray-500 mt-2 ml-8">{STATUS[r.status].ayuda}</p>
              )}
              {r.status === 'atendido' && (
                <p className="text-[12px] text-green-700 mt-2 ml-8 flex items-start gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
                  <span>Atendido el {fdate(r.attended_at)}{r.resolution_note ? `: ${r.resolution_note}` : '.'}</span>
                </p>
              )}
              {r.status === 'anulado' && r.resolution_note && (
                <p className="text-[11.5px] text-gray-500 mt-2 ml-8">{r.resolution_note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
