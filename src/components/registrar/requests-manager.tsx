'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Loader2, X, FileText, Trash2, ChevronDown, ChevronRight, Download, CheckCircle2, Send } from 'lucide-react'

interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }
interface DocType { id: string; name: string; price: number; currency: string; active: boolean }
interface Program { id: string; name: string }
interface ReqCheck { kind: string; ok: boolean | null; note: string }
interface StageField { key: string; label: string }
interface Stage { name: string; fields?: StageField[] }
interface Request {
  id: string; status: string; paid: boolean; requested_at: string; stage_index: number
  student_name: string; document_number: string | null; type_name: string
  price: number; currency: string; stages: Stage[]; stages_count: number
  field_values: Record<string, string>; document_url: string | null; emitted_at: string | null
  has_simplecert: boolean
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-600' },
  payment: { label: 'Pendiente de pago', cls: 'bg-amber-50 text-amber-700' },
  in_progress: { label: 'En proceso', cls: 'bg-blue-50 text-blue-700' },
  ready: { label: 'Listo para emitir', cls: 'bg-indigo-50 text-indigo-700' },
  delivered: { label: 'Entregado', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rechazado', cls: 'bg-red-50 text-red-700' },
}
const fdate = (d: string) => new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

export function RequestsManager() {
  const [requests, setRequests] = useState<Request[]>([])
  const [types, setTypes] = useState<DocType[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Nueva solicitud
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [student, setStudent] = useState<StudentHit | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [programId, setProgramId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ status: string; checks: ReqCheck[]; blocked: boolean } | null>(null)

  const load = useCallback(async () => {
    const [r, t] = await Promise.all([
      fetch('/api/registrar/requests').then(x => x.json()),
      fetch('/api/registrar/document-types').then(x => x.json()),
    ])
    setRequests(r.requests ?? []); setTypes((t.types ?? []).filter((d: DocType) => d.active)); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function search(v: string) {
    setQ(v); setStudent(null); setPrograms([]); setProgramId('')
    if (v.trim().length < 2) { setHits([]); return }
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(v.trim())}`).then(r => r.json())
    setHits(d.students ?? [])
  }
  async function pickStudent(h: StudentHit) {
    setStudent(h); setHits([]); setQ(h.name); setResult(null)
    const d = await fetch(`/api/students/${h.id}/programs`).then(r => r.json()).catch(() => ({ programs: [] }))
    setPrograms(d.programs ?? [])
    if ((d.programs ?? []).length === 1) setProgramId(d.programs[0].id)
  }
  async function create() {
    if (!student || !typeId) return
    setCreating(true); setResult(null)
    const d = await fetch('/api/registrar/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: student.id, document_type_id: typeId, program_id: programId || null }),
    }).then(r => r.json())
    setCreating(false)
    if (d.error) { setResult({ status: 'rejected', checks: [], blocked: true }); return }
    setResult({ status: d.status, checks: d.checks ?? [], blocked: d.blocked })
    load()
  }
  function resetNew() { setOpen(false); setStudent(null); setQ(''); setTypeId(''); setProgramId(''); setResult(null) }

  const [deleting, setDeleting] = useState<string | null>(null)
  async function remove(r: Request) {
    if (!confirm(`¿Borrar la solicitud de "${r.type_name}" de ${r.student_name}? Se eliminará también el cargo pendiente.`)) return
    setDeleting(r.id)
    const d = await fetch(`/api/registrar/requests?id=${r.id}`, { method: 'DELETE' }).then(x => x.json())
    setDeleting(null)
    if (d.error) { alert(d.error); return }
    load()
  }

  if (loading) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!open && <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4" />Nueva solicitud</button>}
      </div>

      {open && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Nueva solicitud</h3>
            <button onClick={resetNew} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          <div className="relative">
            <div className="flex items-center border border-gray-200 rounded-lg px-3">
              <Search className="w-4 h-4 text-gray-400" />
              <input value={q} onChange={e => search(e.target.value)} placeholder="Buscar estudiante…" className="flex-1 px-2 py-2 text-sm focus:outline-none" />
            </div>
            {hits.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                {hits.map(h => <button key={h.id} onClick={() => pickStudent(h)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"><p className="text-sm text-gray-800">{h.name}</p><p className="text-xs text-gray-400">{h.document_number ?? h.email}</p></button>)}
              </div>
            )}
          </div>

          {student && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label><span className="block text-xs text-gray-500 mb-1">Programa</span>
                <select value={programId} onChange={e => setProgramId(e.target.value)} className={inp}>
                  <option value="">— (sin programa específico) —</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label><span className="block text-xs text-gray-500 mb-1">Tipo de documento</span>
                <select value={typeId} onChange={e => setTypeId(e.target.value)} className={inp}>
                  <option value="">Seleccionar…</option>
                  {types.map(t => <option key={t.id} value={t.id}>{t.name}{Number(t.price) > 0 ? ` — ${t.currency} ${Number(t.price).toFixed(2)}` : ' — gratuito'}</option>)}
                </select>
              </label>
            </div>
          )}

          {result && (
            <div className={`text-xs rounded-lg px-3 py-2 ${result.blocked ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              <p className="font-medium">{STATUS[result.status]?.label ?? result.status}</p>
              {result.checks.map((c, i) => <div key={i}>{c.ok === true ? '✓' : c.ok === false ? '✗' : '○'} {c.note}</div>)}
            </div>
          )}

          {student && (
            <button onClick={create} disabled={!typeId || creating} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Crear solicitud
            </button>
          )}
        </div>
      )}

      {/* Lista / cola */}
      {requests.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">Sin solicitudes.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wide">
                <th className="w-6"></th>
                <th className="text-left px-4 py-2.5">Estudiante</th>
                <th className="text-left px-4 py-2.5">Documento</th>
                <th className="text-left px-4 py-2.5">Fecha</th>
                <th className="text-right px-4 py-2.5">Costo</th>
                <th className="text-center px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <RequestRow key={r.id} r={r} expanded={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  onChanged={load} onRemove={() => remove(r)} deleting={deleting === r.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RequestRow({ r, expanded, onToggle, onChanged, onRemove, deleting }: {
  r: Request; expanded: boolean; onToggle: () => void; onChanged: () => void; onRemove: () => void; deleting: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [stageVals, setStageVals] = useState<Record<string, string>>({})

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action)
    const d = await fetch(`/api/registrar/requests/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }),
    }).then(x => x.json())
    setBusy(null)
    if (d.error) { alert(d.error); return }
    onChanged()
  }

  const currentStage = r.stages?.[r.stage_index] as Stage | undefined

  return (
    <>
      <tr className="border-t border-gray-50 hover:bg-gray-50/50">
        <td className="pl-3 text-gray-300 cursor-pointer" onClick={onToggle}>{expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
        <td className="px-4 py-2.5 cursor-pointer" onClick={onToggle}><p className="text-gray-800">{r.student_name}</p><p className="text-xs text-gray-400">{r.document_number ?? ''}</p></td>
        <td className="px-4 py-2.5 text-gray-700"><span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-gray-300" />{r.type_name}</span></td>
        <td className="px-4 py-2.5 text-gray-500 text-xs">{fdate(r.requested_at)}</td>
        <td className="px-4 py-2.5 text-right text-gray-600">{Number(r.price) > 0 ? `${r.currency} ${Number(r.price).toFixed(2)}${r.paid ? ' ✓' : ''}` : '—'}</td>
        <td className="px-4 py-2.5 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-500'}`}>{STATUS[r.status]?.label ?? r.status}</span></td>
        <td className="px-4 py-2.5 text-right">
          {!r.paid && r.status !== 'delivered' && (
            <button onClick={onRemove} disabled={deleting} title="Borrar solicitud no pagada" className="text-gray-300 hover:text-red-600 disabled:opacity-50">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50/60">
          <td></td>
          <td colSpan={6} className="px-4 py-3">
            <div className="space-y-3">
              {/* Etapas: progreso */}
              {r.stages_count > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {r.stages.map((s, i) => (
                    <span key={i} className={`px-2 py-0.5 rounded-full ${i < r.stage_index ? 'bg-green-100 text-green-700' : i === r.stage_index && r.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {i < r.stage_index ? '✓ ' : ''}{s.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Acción según estado */}
              {r.status === 'payment' && (
                <button onClick={() => act('pay')} disabled={busy === 'pay'} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white">
                  {busy === 'pay' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Registrar pago ({r.currency} {Number(r.price).toFixed(2)})
                </button>
              )}

              {r.status === 'in_progress' && currentStage && (
                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">Etapa actual: {currentStage.name}</p>
                  {(currentStage.fields ?? []).map(f => (
                    <label key={f.key} className="block"><span className="block text-[11px] text-gray-500 mb-0.5">{f.label}</span>
                      <input value={stageVals[f.key] ?? r.field_values[f.key] ?? ''} onChange={e => setStageVals(v => ({ ...v, [f.key]: e.target.value }))} className={inp} />
                    </label>
                  ))}
                  <button onClick={() => act('stage', { field_values: stageVals })} disabled={busy === 'stage'} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                    {busy === 'stage' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Completar etapa
                  </button>
                </div>
              )}

              {r.status === 'ready' && (
                r.has_simplecert ? (
                  <button onClick={() => act('emit')} disabled={busy === 'emit'} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white">
                    {busy === 'emit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Emitir documento (SimpleCert)
                  </button>
                ) : (
                  <p className="text-xs text-amber-600">Este tipo de documento no tiene SimpleCert Project ID configurado. Configúralo en «Tipos de Documento» para poder emitir.</p>
                )
              )}

              {r.document_url && (
                <a href={r.document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white">
                  <Download className="w-3.5 h-3.5" />Ver / descargar documento
                </a>
              )}

              {r.emitted_at && <p className="text-[11px] text-gray-400">Emitido el {fdate(r.emitted_at)}</p>}

              {/* Requisitos verificados */}
              {r.status === 'rejected' && <p className="text-xs text-red-600">Rechazada: no cumple los requisitos.</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
