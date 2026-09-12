'use client'

import { useState } from 'react'
import { Loader2, Search, RotateCcw, CheckCircle2, Clock, XCircle, ExternalLink } from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'

// ---------------------------------------------------------------------------
// Recursados declarados (12/09/2026): buscar al estudiante, ver sus
// asignaturas con el último intento REPROBADO (estado calculado), declarar el
// recursado (nace la cuota asociada) y seguir la solicitud: pendiente de pago
// → aceptada (pago completo abre el intento en el registro) → recompletion en
// el LMS (constancia manual mientras el plugin no sea accionable remoto).
// ---------------------------------------------------------------------------
interface Found { id: string; name: string; document: string | null }
interface Elegible {
  course_id: string; course: string; attempt: number
  credits: number | null; rate: number | null; amount: number | null
}
interface Solicitud {
  id: string; course: string; prev_attempt: number; new_attempt: number
  credits: number | null; amount: number | null; pagado: number
  status: string; created_at: string; created_by: string | null
  accepted_at: string | null; lms_opened_at: string | null
}
interface Data {
  student: { id: string; name: string; document: string | null; external_id: string | null }
  elegibles: Elegible[]
  solicitudes: Solicitud[]
}

const money = (n: number | null) => n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export function RetakesManager() {
  const { canEdit, canDelete } = usePermissions()
  const puedeEditar = canEdit('academic_retakes')
  const puedeAnular = canDelete('academic_retakes')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Found[] | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function search() {
    if (query.trim().length < 2) return
    setSearching(true); setResults(null); setData(null)
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(query.trim())}`).then(r => r.json())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setResults(((d.students ?? []) as any[]).map(s => ({
      id: String(s.id),
      name: [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '),
      document: s.document_number ?? null,
    })))
    setSearching(false)
  }

  async function open(id: string) {
    setLoading(true); setResults(null); setNotice(null)
    const d = await fetch(`/api/academic/retakes?student_id=${id}`).then(r => r.json())
    setLoading(false)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setData(d)
  }

  async function declarar(e: Elegible) {
    if (!data) return
    if (!confirm(`¿Declarar el recursado de "${e.course}"?\n\nSe creará una cuota de ${money(e.amount)} (${e.credits} créditos × ${money(e.rate)}) asociada a la solicitud. El intento se abrirá en el registro cuando la cuota esté pagada por completo.`)) return
    setBusy(e.course_id); setNotice(null)
    const r = await fetch('/api/academic/retakes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: data.student.id, course_id: e.course_id }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setNotice({ kind: 'error', text: d.error ?? 'No se pudo crear' }); return }
    setNotice({ kind: 'ok', text: `Solicitud creada: cuota de ${money(d.amount)} con vencimiento ${fdate(d.due_date)}. Al pagarse por completo, la solicitud se acepta sola.` })
    open(data.student.id)
  }

  async function anular(s: Solicitud) {
    if (!data) return
    if (!confirm(`¿Anular la solicitud de "${s.course}"? Se elimina su cuota (solo posible sin pagos).`)) return
    setBusy(s.id)
    const r = await fetch(`/api/academic/retakes?id=${s.id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setNotice({ kind: 'error', text: d.error ?? 'No se pudo anular' }); return }
    open(data.student.id)
  }

  async function marcarLms(s: Solicitud) {
    if (!data) return
    setBusy(s.id)
    const r = await fetch('/api/academic/retakes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, lms_opened: true }),
    })
    setBusy(null)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setNotice({ kind: 'error', text: d.error ?? 'No se pudo marcar' }); return }
    open(data.student.id)
  }

  const Chip = ({ s }: { s: Solicitud }) => {
    if (s.status === 'anulada') return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"><XCircle className="w-3 h-3" />Anulada</span>
    if (s.status === 'aceptada') return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700"><CheckCircle2 className="w-3 h-3" />Aceptada</span>
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><Clock className="w-3 h-3" />Pendiente de pago</span>
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 bg-blue-50 rounded-lg px-4 py-3">
        El recursado se <b>declara</b>, no se deduce: elige la asignatura reprobada, se crea una cuota única asociada
        (créditos × su tarifa congelada), y al pagarse por completo el intento se abre en el registro y se habilita el
        recompletion del aula. El importador de notas solo escribe recursados declarados.
      </p>

      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search() }}
          placeholder="Buscar por nombre, documento o correo…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={search} disabled={searching || query.trim().length < 2}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg">
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
        </button>
      </div>

      {results !== null && (
        <div className="space-y-1.5">
          {results.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">Sin coincidencias.</p>
          ) : results.map(s => (
            <button key={s.id} onClick={() => open(s.id)}
              className="w-full text-left flex items-center justify-between border border-gray-100 hover:border-blue-300 hover:bg-blue-50/40 rounded-lg px-3 py-2 transition-colors">
              <span className="text-sm text-gray-800">{s.name}</span>
              <span className="text-xs text-gray-400">{s.document ?? ''}</span>
            </button>
          ))}
        </div>
      )}

      {loading && <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto" /></div>}
      {notice && (
        <p className={`text-sm rounded-lg px-4 py-3 ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>
      )}

      {data && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="font-semibold text-gray-900">{data.student.name}</p>
            <p className="text-xs text-gray-400">{data.student.document ?? ''}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-gray-400" /> Asignaturas reprobadas (elegibles a recursado)
            </h3>
            {data.elegibles.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Sin asignaturas con el último intento reprobado (o ya tienen solicitud viva).</p>
            ) : (
              <div className="space-y-1.5">
                {data.elegibles.map(e => (
                  <div key={e.course_id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{e.course}</p>
                      <p className="text-[11px] text-gray-400">intento {e.attempt} reprobado · {e.credits ?? '—'} créditos × {money(e.rate)} = <b className="text-gray-600">{money(e.amount)}</b></p>
                    </div>
                    {puedeEditar && (
                      <button onClick={() => declarar(e)} disabled={busy === e.course_id || e.amount == null}
                        title={e.amount == null ? 'Sin tarifa congelada: no se puede cotizar' : 'Declarar recursado y crear la cuota'}
                        className="shrink-0 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">
                        {busy === e.course_id ? '…' : 'Declarar recursado'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Solicitudes</h3>
            {data.solicitudes.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Sin solicitudes.</p>
            ) : (
              <div className="space-y-1.5">
                {data.solicitudes.map(s => (
                  <div key={s.id} className="border border-gray-100 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-gray-800 truncate">{s.course} <span className="text-[11px] text-gray-400">intento {s.new_attempt}</span></p>
                      <Chip s={s} />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {fdate(s.created_at)}{s.created_by ? ` · ${s.created_by}` : ''} · cuota {money(s.amount)} · pagado {money(s.pagado)}
                    </p>
                    {s.status === 'pendiente_pago' && (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-amber-700">El pago completo de la cuota acepta la solicitud y abre el intento.</span>
                        {puedeAnular && (
                          <button onClick={() => anular(s)} disabled={busy === s.id} className="text-[11px] text-red-500 hover:underline">anular</button>
                        )}
                      </div>
                    )}
                    {s.status === 'aceptada' && (
                      <div className="mt-1 text-[11px]">
                        {s.lms_opened_at ? (
                          <span className="text-green-700">Recompletion abierto en el LMS el {fdate(s.lms_opened_at)}. Las notas del nuevo intento entrarán al intento {s.new_attempt}.</span>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-blue-700">
                            <ExternalLink className="w-3 h-3" />
                            Falta abrir el recompletion en el aula de esta asignatura para {data.student.name}{data.student.external_id ? ` (idnumber ${data.student.external_id})` : ''}.
                            {puedeEditar && (
                              <button onClick={() => marcarLms(s)} disabled={busy === s.id} className="underline hover:text-blue-900">marcar como abierto</button>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
