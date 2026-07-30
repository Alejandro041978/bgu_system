'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Loader2, X, FileText, Download, Eye, Camera, Check, Smartphone } from 'lucide-react'

// Requisitos de foto de ISIC (manual CCDB): color, mínimo 500×500 px, < 5 MB,
// JPG o PNG. Se comprueban en el navegador para avisar al instante — el
// servidor los vuelve a comprobar, que es donde la validación cuenta.
const FOTO_MIN_PX = 500
const FOTO_MAX_MB = 5

interface DocType { id: string; name: string; price: number; currency: string; scope_category_id: string | null; scope_category_ids: string[] | null; scope_program_ids: string[]; sample_image_url: string | null; request_note_label: string | null }
interface Program { id: string; name: string; category_id: string | null }
interface ReqCheck { kind: string; ok: boolean | null; note: string }
interface Request {
  id: string; status: string; paid: boolean; requested_at: string; document_url: string | null
  type_name: string; price: number; currency: string
  isic_card?: boolean; isic_card_number?: string | null
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
  const [note, setNote] = useState('')
  const [result, setResult] = useState<{ status: string; checks: ReqCheck[]; blocked: boolean } | null>(null)
  // Preview de requisitos/costo al seleccionar el documento (sin crear nada)
  const [preview, setPreview] = useState<{ checks: ReqCheck[]; blocked: boolean; price: number; currency: string; requiresPhoto: boolean } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Foto del titular (carné ISIC): se sube ANTES de crear la solicitud, para no
  // generar una cuota por un documento que no se va a poder emitir.
  const [foto, setFoto] = useState<{ path: string; url: string | null; width: number; height: number } | null>(null)
  const [fotoError, setFotoError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)

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

  const selectedType = availableTypes.find(x => x.id === typeId)
  const noteMissing = !!selectedType?.request_note_label && !note.trim()

  // Al elegir documento (o cambiar programa/nota): verifica requisitos y costo
  // sin crear la solicitud, para mostrar el estado y habilitar/deshabilitar el botón.
  useEffect(() => {
    setPreview(null); setConfirming(false); setResult(null); setFoto(null); setFotoError(null)
    if (!typeId) return
    let cancelled = false
    setPreviewing(true)
    fetch('/api/student/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview: true, document_type_id: typeId, program_id: programId || null }),
    }).then(r => r.json()).then(d => {
      if (cancelled) return
      if (d.error) setPreview({ checks: [{ kind: 'error', ok: false, note: d.error }], blocked: true, price: 0, currency: 'USD', requiresPhoto: false })
      else setPreview({ checks: d.checks ?? [], blocked: !!d.blocked, price: Number(d.price) || 0, currency: d.currency ?? 'USD', requiresPhoto: !!d.requiresPhoto })
    }).catch(() => { if (!cancelled) setPreview(null) })
      .finally(() => { if (!cancelled) setPreviewing(false) })
    return () => { cancelled = true }
  }, [typeId, programId])

  // Botón habilitado solo si: hay documento, la nota (si aplica) está completa,
  // la foto (si aplica) ya subió, el preview cargó y NO está bloqueado.
  const fotoMissing = !!preview?.requiresPhoto && !foto
  const canSubmit = !!typeId && !noteMissing && !fotoMissing && !previewing && !!preview && !preview.blocked

  // Comprueba la foto en el navegador antes de gastar la subida, y la envía.
  async function subirFoto(file: File) {
    setFotoError(null); setFoto(null)
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
      setFotoError('La foto debe ser JPG o PNG.'); return
    }
    if (file.size > FOTO_MAX_MB * 1024 * 1024) {
      setFotoError(`La foto pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${FOTO_MAX_MB} MB.`); return
    }
    // Medir antes de subir: si no llega a 500×500 px, ISIC la rechazaría.
    const dims = await new Promise<{ w: number; h: number } | null>(resolve => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }) }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      img.src = url
    })
    if (!dims) { setFotoError('No se pudo leer la imagen.'); return }
    if (dims.w < FOTO_MIN_PX || dims.h < FOTO_MIN_PX) {
      setFotoError(`Tu foto mide ${dims.w}×${dims.h} px y el mínimo que exige ISIC es ${FOTO_MIN_PX}×${FOTO_MIN_PX} px. Usa una foto de más resolución.`)
      return
    }
    setSubiendo(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/student/isic-photo', { method: 'POST', body: fd })
    const d = await res.json()
    setSubiendo(false)
    if (!res.ok) { setFotoError(d.error ?? 'No se pudo subir la foto.'); return }
    setFoto({ path: d.path, url: d.preview_url ?? null, width: d.width, height: d.height })
  }

  function onSolicitarClick() {
    if (!canSubmit || creating) return
    // Con costo: pide confirmación (se cargará una cuota). Gratuito: directo.
    if ((preview?.price ?? 0) > 0) setConfirming(true)
    else create()
  }

  async function create() {
    if (!typeId || noteMissing) return
    setCreating(true); setResult(null)
    const d = await fetch('/api/student/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_type_id: typeId, program_id: programId || null, request_note: note.trim() || null, photo_path: foto?.path ?? null }),
    }).then(r => r.json())
    setCreating(false); setConfirming(false)
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

          {/* Texto del solicitante (documentos tipo Custom Attestation) */}
          {selectedType?.request_note_label && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{selectedType.request_note_label} <span className="text-red-500">*</span></label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe con detalle qué necesitas que diga el documento y para qué entidad lo presentarás…" />
            </div>
          )}

          {/* Foto del titular (carné ISIC) */}
          {preview?.requiresPhoto && !preview.blocked && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <p className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-gray-400" /> Tu foto <span className="text-red-500">*</span>
              </p>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Tipo pasaporte y <strong>en color</strong>: fondo claro y uniforme, cara de frente, sin gafas de sol ni
                gorra. Mínimo <strong>500×500 px</strong> y menos de <strong>5 MB</strong>, en JPG o PNG. Es la foto que
                saldrá impresa en tu carné internacional.
              </p>

              {foto ? (
                <div className="flex items-start gap-3">
                  {foto.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={foto.url} alt="Tu foto" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                  )}
                  <div className="text-[11px] space-y-1">
                    <p className="text-green-700 font-medium flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Foto aceptada ({foto.width}×{foto.height} px)</p>
                    <button onClick={() => { setFoto(null); setFotoError(null) }} className="text-blue-600 hover:underline">Cambiar foto</button>
                  </div>
                </div>
              ) : (
                <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer">
                  {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  {subiendo ? 'Subiendo…' : 'Elegir foto'}
                  <input type="file" accept="image/jpeg,image/png" className="hidden" disabled={subiendo}
                    onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f); e.target.value = '' }} />
                </label>
              )}
              {fotoError && <p className="text-[11px] text-red-600">{fotoError}</p>}
            </div>
          )}

          {/* Requisitos y costo del documento seleccionado (antes de solicitar) */}
          {previewing && <p className="text-xs text-gray-400">Verificando requisitos…</p>}
          {preview && !result && (
            <div className={`text-xs rounded-lg px-3 py-2 space-y-0.5 border ${preview.blocked ? 'bg-red-50 border-red-100 text-red-700' : 'bg-gray-50 border-gray-100 text-gray-600'}`}>
              <p className="font-medium text-gray-700">Requisitos</p>
              {preview.checks.length === 0
                ? <p>Sin requisitos especiales para este documento.</p>
                : preview.checks.map((c, i) => (
                    <div key={i} className={c.ok === true ? 'text-green-700' : c.ok === false ? 'text-red-700' : 'text-gray-500'}>
                      {c.ok === true ? '✓' : c.ok === false ? '✗' : '○'} {c.note}
                    </div>
                  ))}
              {preview.blocked
                ? <p className="font-medium text-red-700 pt-1">No cumples los requisitos para solicitar este documento.</p>
                : preview.price > 0
                  ? <p className="pt-1">Costo: <strong>{preview.currency} {preview.price.toFixed(2)}</strong> — se cargará una cuota al solicitar.</p>
                  : <p className="pt-1">Documento gratuito.</p>}
            </div>
          )}

          {/* Advertencia + confirmación: se generará una cuota por pagar */}
          {confirming && preview && !result && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-2">
              <p className="font-medium">⚠️ Se generará una cuota por pagar</p>
              <p>Al solicitar este documento se cargará una cuota de <strong>{preview.currency} {preview.price.toFixed(2)}</strong> en tu estado de cuenta. El documento se emite una vez que la pagues. ¿Deseas continuar?</p>
              <div className="flex gap-2 pt-0.5">
                <button onClick={create} disabled={creating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Confirmar solicitud
                </button>
                <button onClick={() => setConfirming(false)} disabled={creating}
                  className="px-3 py-1.5 font-medium rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
              </div>
            </div>
          )}

          {result && (
            <div className={`text-xs rounded-lg px-3 py-2 ${result.blocked ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              <p className="font-medium">{result.blocked ? 'No se pudo procesar' : STATUS[result.status]?.label ?? result.status}</p>
              {result.checks.map((c, i) => <div key={i}>{c.ok === true ? '✓' : c.ok === false ? '✗' : '○'} {c.note}</div>)}
              {!result.blocked && result.status === 'payment' && <p className="mt-1">Se generó el cargo en tu estado de cuenta. El documento se emite tras el pago.</p>}
            </div>
          )}

          {!confirming && !result && (
            <button onClick={onSolicitarClick} disabled={!canSubmit || creating} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Solicitar
            </button>
          )}
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
                  {r.isic_card_number && <p className="text-[11px] font-mono text-gray-500 mt-0.5">Nº {r.isic_card_number}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-500'}`}>{STATUS[r.status]?.label ?? r.status}</span>
                {r.document_url && (
                  <a href={r.document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white">
                    {r.isic_card
                      ? <><Smartphone className="w-3.5 h-3.5" />Activar en la app</>
                      : <><Download className="w-3.5 h-3.5" />Descargar</>}
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
