'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ChevronDown, ChevronRight, Upload, Send, CheckCircle2, Award } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

const fdate = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null)

const CHECKS: { name: string; label: string; apostilleOnly?: boolean }[] = [
  { name: 'simplecert_ok', label: 'Conformidad SimpleCert' },
  { name: 'sent_florida', label: 'Envío a Florida (Renzo)' },
  { name: 'printed', label: 'Impresión' },
  { name: 'notarized', label: 'Notarización', apostilleOnly: true },
  { name: 'apostille_started', label: 'Inicio apostillado', apostilleOnly: true },
]

const RECEIVER_FIELDS: [string, string][] = [
  ['receiver_name', 'Quién recibe'], ['receiver_phone', 'Teléfono'], ['receiver_address', 'Dirección'],
  ['receiver_references', 'Referencias'], ['receiver_city', 'Ciudad'], ['receiver_postal', 'Código postal'], ['receiver_country', 'País'],
]

export function DegreesControl() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [groups, setGroups] = useState<string[]>([])
  const [group, setGroup] = useState('')
  const [status, setStatus] = useState('en_proceso')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (group) p.set('group', group)
    if (status) p.set('status', status)
    fetch(`/api/registrar/degrees?${p}`).then(r => r.json()).then(d => {
      if (d.error) setNotice({ kind: 'error', text: d.error })
      else { setRows(d.rows ?? []); setGroups(d.groups ?? []) }
    })
  }, [group, status])
  useEffect(() => { load() }, [load])

  async function patch(id: string, body: object, okText?: string) {
    setBusy(id); setNotice(null)
    const d = await fetch('/api/registrar/degrees', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    }).then(r => r.json())
    setBusy(null)
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return false }
    if (okText) setNotice({ kind: 'ok', text: okText })
    load()
    return true
  }

  const visible = (rows ?? []).filter(r => {
    if (!q) return true
    const s = q.toLowerCase()
    return r.student_name.toLowerCase().includes(s) || r.document.includes(s) || (r.doc_code ?? '').includes(s)
  })

  if (rows === null) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-4">
      {notice && (
        <p className={`text-sm px-3 py-2 rounded-lg ${notice.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {[['en_proceso', 'En proceso'], ['entregado', 'Entregados'], ['', 'Todos']].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${status === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
        ))}
        <select value={group} onChange={e => setGroup(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los grupos</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nombre, documento o código…"
          className="ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
        {visible.length === 0 && <p className="px-4 py-10 text-center text-sm text-gray-400">Sin expedientes en este filtro.</p>}
        {visible.map(r => (
          <ExpedienteRow key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)}
            busy={busy === r.id} patch={patch} onChanged={load} />
        ))}
      </div>

      <p className="text-[11px] text-gray-400">
        El expediente nace solo al pagarse la solicitud del título. Cada check guarda fecha y responsable automáticamente. Notarización y apostillado solo aparecen si el expediente incluye apostilla. La traducción/homologación es otro servicio (hoja aparte).
      </p>
    </div>
  )
}

function ExpedienteRow({ r, open, onToggle, busy, patch, onChanged }: {
  r: Row; open: boolean; onToggle: () => void; busy: boolean
  patch: (id: string, body: object, okText?: string) => Promise<boolean>
  onChanged: () => void
}) {
  const fileScan = useRef<HTMLInputElement>(null)
  const fileCargo = useRef<HTMLInputElement>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  async function upload(kind: 'scan' | 'cargo', file: File) {
    const fd = new FormData()
    fd.set('id', r.id); fd.set('kind', kind); fd.set('file', file)
    const d = await fetch('/api/registrar/degrees/upload', { method: 'POST', body: fd }).then(x => x.json())
    if (d.error) alert(d.error)
    onChanged()
  }

  const doneChecks = CHECKS.filter(c => (!c.apostilleOnly || r.includes_apostille) && r[`${c.name}_at`]).length
  const totalChecks = CHECKS.filter(c => !c.apostilleOnly || r.includes_apostille).length + 3 // + scans, correspondencia, entregado

  return (
    <div>
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50">
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <span className="font-mono text-xs text-gray-500 w-16">{r.doc_code ?? '—'}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-gray-800 truncate">{r.student_name}</span>
          <span className="block text-[11px] text-gray-400 truncate">{r.document} · {r.program_name ?? 'sin programa'}</span>
        </span>
        {r.tramite_group && <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r.tramite_group}</span>}
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.includes_apostille ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
          {r.includes_apostille ? 'Diploma + Apostilla' : 'Solo diploma'}
        </span>
        {r.status === 'entregado'
          ? <span className="inline-flex items-center gap-1 text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full"><Award className="w-3 h-3" /> Entregado {fdate(r.delivered_at)}</span>
          : <span className="text-[11px] text-gray-400">{doneChecks + (r.scans_uploaded_at ? 1 : 0) + (r.courier_sent_at ? 1 : 0)}/{totalChecks} etapas</span>}
      </button>

      {open && (
        <div className="px-6 pb-4 pt-1 bg-gray-50/40 space-y-4">
          {/* Etapas */}
          <div className="flex flex-wrap gap-2">
            {CHECKS.filter(c => !c.apostilleOnly || r.includes_apostille).map(c => {
              const at = r[`${c.name}_at`]
              return (
                <label key={c.name} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${at ? 'bg-green-50 border-green-200 text-green-800' : 'bg-white border-gray-200 text-gray-600'}`}
                  title={at ? `${fdate(at)} · ${r[`${c.name}_by`] ?? ''}` : ''}>
                  <input type="checkbox" checked={!!at} disabled={busy}
                    onChange={e => patch(r.id, { check: { name: c.name, value: e.target.checked } })}
                    className="rounded border-gray-300" />
                  {c.label}{at && <span className="text-[10px] opacity-70">{fdate(at)}</span>}
                </label>
              )
            })}
            <label className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 cursor-pointer">
              <input type="checkbox" checked={r.includes_apostille} disabled={busy}
                onChange={e => patch(r.id, { includes_apostille: e.target.checked })}
                className="rounded border-gray-300" />
              Incluye apostilla
            </label>
          </div>

          {/* Escaneos + envío digital */}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileScan} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload('scan', f); e.target.value = '' }} />
            <button onClick={() => fileScan.current?.click()}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${r.scans_uploaded_at ? 'bg-green-50 border-green-200 text-green-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Upload className="w-3.5 h-3.5" /> {r.scans_uploaded_at ? `Escaneos subidos ${fdate(r.scans_uploaded_at)}` : 'Subir escaneos'}
            </button>
            <button onClick={() => patch(r.id, { action: 'send_digital' }, 'Documentos digitales enviados al graduado')}
              disabled={busy || !r.scans_uploaded_at}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${r.digital_sent_at ? 'bg-green-50 border-green-200 text-green-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40'}`}>
              <Send className="w-3.5 h-3.5" /> {r.digital_sent_at ? `Enviado al graduado ${fdate(r.digital_sent_at)}` : 'Enviar al graduado (digital)'}
            </button>
          </div>

          {/* Entrega */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">Datos de entrega (precargados del perfil, editables)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {RECEIVER_FIELDS.map(([k, label]) => (
                <label key={k} className={k === 'receiver_address' || k === 'receiver_references' ? 'col-span-2' : ''}>
                  <span className="block text-[10px] text-gray-400 mb-0.5">{label}</span>
                  <input value={fields[k] ?? r[k] ?? ''}
                    onChange={e => setFields(p => ({ ...p, [k]: e.target.value }))}
                    onBlur={e => { if (e.target.value !== (r[k] ?? '')) patch(r.id, { fields: { [k]: e.target.value } }) }}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
              ))}
              <label>
                <span className="block text-[10px] text-gray-400 mb-0.5">Grupo de trámite</span>
                <input value={fields.tramite_group ?? r.tramite_group ?? ''} placeholder="G1 2026"
                  onChange={e => setFields(p => ({ ...p, tramite_group: e.target.value }))}
                  onBlur={e => { if (e.target.value !== (r.tramite_group ?? '')) patch(r.id, { fields: { tramite_group: e.target.value } }) }}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>
          </div>

          {/* Correspondencia + entrega final */}
          <div className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${r.courier_sent_at ? 'bg-green-50 border-green-200 text-green-800' : 'bg-white border-gray-200 text-gray-600'}`}
              title={r.courier_sent_at ? `${fdate(r.courier_sent_at)} · ${r.courier_sent_by ?? ''}` : ''}>
              <input type="checkbox" checked={!!r.courier_sent_at} disabled={busy}
                onChange={e => patch(r.id, { check: { name: 'courier_sent', value: e.target.checked } })}
                className="rounded border-gray-300" />
              Correspondencia enviada{r.courier_sent_at && <span className="text-[10px] opacity-70">{fdate(r.courier_sent_at)}</span>}
            </label>
            <input value={fields.courier_tracking ?? r.courier_tracking ?? ''} placeholder="Nº de guía / tracking"
              onChange={e => setFields(p => ({ ...p, courier_tracking: e.target.value }))}
              onBlur={e => { if (e.target.value !== (r.courier_tracking ?? '')) patch(r.id, { fields: { courier_tracking: e.target.value } }) }}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-44 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input ref={fileCargo} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload('cargo', f); e.target.value = '' }} />
            <button onClick={() => fileCargo.current?.click()}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${r.delivery_proof_url ? 'bg-green-50 border-green-200 text-green-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Upload className="w-3.5 h-3.5" /> {r.delivery_proof_url ? 'Cargo subido' : 'Subir cargo de entrega'}
            </button>
            <label className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${r.delivered_at ? 'bg-green-100 border-green-300 text-green-900 font-medium' : 'bg-white border-gray-200 text-gray-600'}`}
              title={r.delivered_at ? `${fdate(r.delivered_at)} · ${r.delivered_by ?? ''}` : ''}>
              <input type="checkbox" checked={!!r.delivered_at} disabled={busy}
                onChange={e => patch(r.id, { check: { name: 'delivered', value: e.target.checked } })}
                className="rounded border-gray-300" />
              <CheckCircle2 className="w-3.5 h-3.5" /> Diploma recibido{r.delivered_at && <span className="text-[10px] opacity-70">{fdate(r.delivered_at)}</span>}
            </label>
          </div>

          {/* Observaciones */}
          <textarea defaultValue={r.notes ?? ''} placeholder="Observaciones…" rows={2}
            onBlur={e => { if (e.target.value !== (r.notes ?? '')) patch(r.id, { fields: { notes: e.target.value } }) }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
        </div>
      )}
    </div>
  )
}
