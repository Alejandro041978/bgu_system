'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, ClipboardList, Check, X, Plus, Search } from 'lucide-react'

interface Row {
  id: string; status: string; requested_at: string; paid_at: string | null
  attended_at: string | null; attended_by: string | null
  resolution_note: string | null; request_note: string | null
  student_name: string; document_number: string | null; email: string | null
  type_name: string; price: number; currency: string
}
interface TramiteType { id: string; name: string; price: number; currency: string; active: boolean; request_note_label: string | null }
interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }

const STATUS: Record<string, { label: string; cls: string }> = {
  iniciado: { label: 'Iniciado', cls: 'bg-amber-50 text-amber-700' },
  pagado: { label: 'Pagado', cls: 'bg-blue-50 text-blue-700' },
  atendido: { label: 'Atendido', cls: 'bg-green-100 text-green-800' },
  anulado: { label: 'Anulado', cls: 'bg-gray-100 text-gray-500' },
}
const ORDEN = ['pagado', 'iniciado', 'atendido', 'anulado'] as const
const fdate = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const money = (n: number, c: string) => `${c} ${Number(n).toFixed(2)}`

export function TramitesManager() {
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [types, setTypes] = useState<TramiteType[]>([])
  // Arranca en "pagado": es la bandeja de trabajo real — lo pagado y sin
  // atender es lo único que espera una acción del administrativo.
  const [filtro, setFiltro] = useState<string>('pagado')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nota, setNota] = useState<Record<string, string>>({})

  // Alta en nombre del estudiante (el que llega por helpdesk o en persona)
  const [nuevo, setNuevo] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [student, setStudent] = useState<StudentHit | null>(null)
  const [nuevoTipo, setNuevoTipo] = useState('')
  const [nuevaNota, setNuevaNota] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/registrar/tramites?status=${filtro}`)
    const d = await res.json()
    setLoading(false)
    if (!res.ok) { setError(d.error ?? 'Error'); return }
    setError(null)
    setRows(d.rows ?? []); setCounts(d.counts ?? {}); setTypes(d.types ?? [])
  }, [filtro])
  useEffect(() => { load() }, [load])

  async function accion(id: string, action: 'atender' | 'anular') {
    setBusy(id); setError(null)
    const res = await fetch('/api/registrar/tramites', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, resolution_note: nota[id] ?? null }),
    })
    const d = await res.json()
    setBusy(null)
    if (!res.ok) { setError(d.error ?? 'No se pudo completar'); return }
    setNota(n => ({ ...n, [id]: '' }))
    load()
  }

  async function buscar(v: string) {
    setQ(v); setStudent(null)
    if (v.trim().length < 2) { setHits([]); return }
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(v.trim())}`).then(r => r.json())
    setHits(d.students ?? [])
  }

  async function crear() {
    if (!student || !nuevoTipo) return
    setBusy('nuevo'); setError(null)
    const res = await fetch('/api/registrar/tramites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: student.id, tramite_type_id: nuevoTipo, request_note: nuevaNota.trim() || null }),
    })
    const d = await res.json()
    setBusy(null)
    if (!res.ok) { setError(d.error ?? 'No se pudo crear'); return }
    setNuevo(false); setStudent(null); setQ(''); setNuevoTipo(''); setNuevaNota('')
    setFiltro('iniciado')
    load()
  }

  const tipoNuevo = types.find(t => t.id === nuevoTipo)

  return (
    <div className="space-y-4">
      {/* Los cuatro estados del circuito */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ORDEN.map(k => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`rounded-xl p-3 text-left border transition-colors ${filtro === k ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <p className={`text-2xl font-bold ${k === 'pagado' ? 'text-blue-700' : k === 'iniciado' ? 'text-amber-700' : k === 'atendido' ? 'text-green-700' : 'text-gray-500'}`}>
              {counts[k] ?? 0}
            </p>
            <p className="text-xs text-gray-500">{STATUS[k].label}{k === 'pagado' ? ' · por atender' : ''}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={() => setFiltro('todos')}
          className={`px-3 py-1 rounded-lg text-xs font-medium border ${filtro === 'todos' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200'}`}>
          Ver todos
        </button>
        {!nuevo && (
          <button onClick={() => setNuevo(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4" />Nuevo trámite
          </button>
        )}
      </div>

      {error && <p className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">{error}</p>}

      {/* Alta por el administrativo: mismo circuito, se genera la cuota igual */}
      {nuevo && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Nuevo trámite</h3>
            <button onClick={() => { setNuevo(false); setStudent(null); setQ('') }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="relative">
            <div className="flex items-center border border-gray-200 rounded-lg px-3">
              <Search className="w-4 h-4 text-gray-400" />
              <input value={q} onChange={e => buscar(e.target.value)} placeholder="Buscar estudiante por nombre, documento o correo…"
                className="flex-1 px-2 py-2 text-sm focus:outline-none" />
            </div>
            {hits.length > 0 && !student && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {hits.map(h => (
                  <button key={h.id} onClick={() => { setStudent(h); setHits([]); setQ(h.name) }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm">
                    {h.name}<span className="text-xs text-gray-400 ml-2">{h.document_number ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {student && (
            <>
              <label className="block">
                <span className="block text-xs text-gray-500 mb-1">Trámite</span>
                <select value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value)} className={inp}>
                  <option value="">Seleccionar…</option>
                  {types.filter(t => t.active).map(t => (
                    <option key={t.id} value={t.id}>{t.name} — {money(t.price, t.currency)}</option>
                  ))}
                </select>
              </label>
              {tipoNuevo?.request_note_label && (
                <label className="block">
                  <span className="block text-xs text-gray-500 mb-1">{tipoNuevo.request_note_label}</span>
                  <textarea value={nuevaNota} onChange={e => setNuevaNota(e.target.value)} rows={2} className={inp} />
                </label>
              )}
              <p className="text-[11.5px] text-amber-700">
                Se generará la cuota de {tipoNuevo ? money(tipoNuevo.price, tipoNuevo.currency) : '—'} en el estado de cuenta del estudiante.
              </p>
              <button onClick={crear} disabled={!nuevoTipo || busy === 'nuevo'}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                {busy === 'nuevo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Crear trámite
              </button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-12 text-center">
          {filtro === 'pagado' ? 'No hay trámites pagados esperando atención.' : 'Sin trámites en este estado.'}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                  <ClipboardList className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{r.student_name}
                      <span className="text-xs text-gray-400 ml-2">{r.document_number ?? ''}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {r.type_name} · {money(r.price, r.currency)} · solicitado {fdate(r.requested_at)}
                      {r.paid_at ? ` · pagado ${fdate(r.paid_at)}` : ''}
                    </p>
                    {r.request_note && <p className="text-xs text-gray-600 mt-1 italic">“{r.request_note}”</p>}
                  </div>
                </div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${STATUS[r.status]?.cls ?? 'bg-gray-100'}`}>
                  {STATUS[r.status]?.label ?? r.status}
                </span>
              </div>

              {(r.status === 'pagado' || r.status === 'iniciado') && (
                <div className="mt-3 ml-8 space-y-2">
                  <input value={nota[r.id] ?? ''} onChange={e => setNota(n => ({ ...n, [r.id]: e.target.value }))}
                    placeholder={r.status === 'pagado' ? 'Qué se resolvió (queda en el registro y lo ve el estudiante)…' : 'Motivo de la anulación…'}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="flex gap-2">
                    {r.status === 'pagado' && (
                      <button onClick={() => accion(r.id, 'atender')} disabled={busy === r.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white">
                        {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Marcar atendido
                      </button>
                    )}
                    <button onClick={() => accion(r.id, 'anular')} disabled={busy === r.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                      <X className="w-4 h-4" />Anular
                    </button>
                  </div>
                  {r.status === 'iniciado' && (
                    <p className="text-[11px] text-gray-400">
                      Aún sin pagar. Al anular se elimina su cuota del estado de cuenta (si no tiene pagos).
                    </p>
                  )}
                </div>
              )}

              {(r.status === 'atendido' || r.status === 'anulado') && (
                <p className="text-[11.5px] text-gray-500 mt-2 ml-8">
                  {r.status === 'atendido' ? `Atendido ${fdate(r.attended_at)}` : 'Anulado'}
                  {r.attended_by ? ` por ${r.attended_by}` : ''}
                  {r.resolution_note ? ` — ${r.resolution_note}` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
