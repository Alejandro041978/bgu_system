'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Loader2, X, FileText, Download, Eye } from 'lucide-react'

interface DocType { id: string; name: string; price: number; currency: string; scope_category_id: string | null; scope_category_ids: string[] | null; scope_program_ids: string[]; sample_image_url: string | null }
interface Program { id: string; name: string; category_id: string | null }
interface ReqCheck { kind: string; ok: boolean | null; note: string }
interface Request {
  id: string; status: string; paid: boolean; requested_at: string; document_url: string | null
  type_name: string; price: number; currency: string
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-600' },
  payment: { label: 'Pendiente de pago', cls: 'bg-amber-50 text-amber-700' },
  in_progress: { label: 'En proceso', cls: 'bg-blue-50 text-blue-700' },
  ready: { label: 'En emisión', cls: 'bg-indigo-50 text-indigo-700' },
  delivered: { label: 'Listo', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'No procede', cls: 'bg-red-50 text-red-700' },
}
const fdate = (d: string) => new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

export function StudentDocuments() {
  const [requests, setRequests] = useState<Request[]>([])
  const [types, setTypes] = useState<DocType[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const [programId, setProgramId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ status: string; checks: ReqCheck[]; blocked: boolean } | null>(null)

  const load = useCallback(async () => {
    const d = await fetch('/api/student/documents').then(r => r.json())
    setRequests(d.requests ?? []); setTypes(d.types ?? []); setPrograms(d.programs ?? [])
    if ((d.programs ?? []).length === 1) setProgramId(d.programs[0].id)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const selectedProgram = programs.find(p => p.id === programId)
  const availableTypes = types.filter(t => {
    const progScope = t.scope_program_ids ?? []
    if (progScope.length > 0) return programId ? progScope.includes(programId) : false
    const catScope = [...(t.scope_category_ids ?? []), ...(t.scope_category_id ? [t.scope_category_id] : [])]
    if (catScope.length > 0) return selectedProgram?.category_id ? catScope.includes(selectedProgram.category_id) : false
    return true
  })

  async function create() {
    if (!typeId) return
    setCreating(true); setResult(null)
    const d = await fetch('/api/student/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_type_id: typeId, program_id: programId || null }),
    }).then(r => r.json())
    setCreating(false)
    if (d.error) { setResult({ status: 'rejected', checks: [{ kind: 'error', ok: false, note: d.error }], blocked: true }); return }
    setResult({ status: d.status, checks: d.checks ?? [], blocked: d.blocked })
    load()
  }

  if (loading) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!open && <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4" />Solicitar documento</button>}
      </div>

      {open && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Solicitar documento</h3>
            <button onClick={() => { setOpen(false); setResult(null); setTypeId('') }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="block text-xs text-gray-500 mb-1">Programa</span>
              <select value={programId} onChange={e => { setProgramId(e.target.value); setTypeId(''); setResult(null) }} className={inp}>
                <option value="">Seleccionar…</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label><span className="block text-xs text-gray-500 mb-1">Documento</span>
              <select value={typeId} onChange={e => { setTypeId(e.target.value); setResult(null) }} className={inp}>
                <option value="">Seleccionar…</option>
                {availableTypes.map(t => <option key={t.id} value={t.id}>{t.name}{Number(t.price) > 0 ? ` — ${t.currency} ${Number(t.price).toFixed(2)}` : ' — gratuito'}</option>)}
              </select>
              {programId && availableTypes.length === 0 && <span className="block text-[11px] text-amber-600 mt-1">No hay documentos disponibles para este programa.</span>}
            </label>
          </div>

          {/* Vista previa del documento seleccionado */}
          {(() => {
            const t = availableTypes.find(x => x.id === typeId)
            if (!t?.sample_image_url) return null
            return (
              <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.sample_image_url} alt="Ejemplo del documento" className="w-24 h-auto rounded border border-gray-200" />
                <div className="text-xs text-gray-500">
                  <p className="font-medium text-gray-700 mb-1">Así se ve este documento</p>
                  <a href={t.sample_image_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
                    <Eye className="w-3.5 h-3.5" />Ver ejemplo completo
                  </a>
                </div>
              </div>
            )
          })()}

          {result && (
            <div className={`text-xs rounded-lg px-3 py-2 ${result.blocked ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              <p className="font-medium">{result.blocked ? 'No se pudo procesar' : STATUS[result.status]?.label ?? result.status}</p>
              {result.checks.map((c, i) => <div key={i}>{c.ok === true ? '✓' : c.ok === false ? '✗' : '○'} {c.note}</div>)}
              {!result.blocked && result.status === 'payment' && <p className="mt-1">Se generó el cargo en tu estado de cuenta. El documento se emite tras el pago.</p>}
            </div>
          )}

          <button onClick={create} disabled={!typeId || creating} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Solicitar
          </button>
        </div>
      )}

      {/* Lista de solicitudes */}
      {requests.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">Aún no has solicitado documentos.</p>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-gray-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.type_name}</p>
                  <p className="text-xs text-gray-400">{fdate(r.requested_at)}{Number(r.price) > 0 ? ` · ${r.currency} ${Number(r.price).toFixed(2)}${r.paid ? ' (pagado)' : ''}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-500'}`}>{STATUS[r.status]?.label ?? r.status}</span>
                {r.document_url && (
                  <a href={r.document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white">
                    <Download className="w-3.5 h-3.5" />Descargar
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
