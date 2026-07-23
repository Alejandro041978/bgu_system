'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Upload, Trash2, FileCheck2, Pencil } from 'lucide-react'

interface DocType { id: string; name: string; sort_order: number; active: boolean }
interface Doc { id: string; doc_type_id: string; file_name: string | null; uploaded_at: string; uploaded_by: string | null; url: string | null }
interface Row {
  enrollment_id: string; student_name: string; document_number: string | null
  program_name: string | null; docs: Doc[]
}

export function AdmissionDocuments() {
  const [convocatorias, setConvocatorias] = useState<{ id: string; name: string }[]>([])
  const [types, setTypes] = useState<DocType[]>([])
  const [students, setStudents] = useState<Row[]>([])
  const [convId, setConvId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)  // `${enr}|${type}`
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef<{ enrollmentId: string; docTypeId: string } | null>(null)

  const load = useCallback(async (c: string) => {
    setLoading(true)
    const d = await fetch(`/api/sales/admission-docs${c ? `?convocatoria=${c}` : ''}`).then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setConvocatorias(d.convocatorias ?? []); setTypes((d.types ?? []).filter((t: DocType) => t.active))
    setStudents(d.students ?? []); setLoading(false)
  }, [])
  useEffect(() => { load(convId) }, [convId, load])

  function pickFile(enrollmentId: string, docTypeId: string) {
    pendingRef.current = { enrollmentId, docTypeId }
    fileRef.current?.click()
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const p = pendingRef.current
    if (!file || !p) return
    setUploading(`${p.enrollmentId}|${p.docTypeId}`); setError(null)
    const fd = new FormData()
    fd.set('enrollment_id', p.enrollmentId); fd.set('doc_type_id', p.docTypeId); fd.set('file', file)
    const d = await fetch('/api/sales/admission-docs', { method: 'POST', body: fd }).then(r => r.json())
    setUploading(null)
    if (d.error) { setError(d.error); return }
    load(convId)
  }

  async function removeDoc(id: string) {
    if (!confirm('¿Quitar este documento?')) return
    const d = await fetch(`/api/sales/admission-docs?id=${id}`, { method: 'DELETE' }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load(convId)
  }

  async function renameType(t: DocType) {
    const name = prompt('Nombre del documento:', t.name)
    if (!name?.trim() || name.trim() === t.name) return
    const d = await fetch('/api/sales/admission-docs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, name }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load(convId)
  }

  const completos = students.filter(s => s.docs.length >= types.length).length

  return (
    <div className="space-y-5">
      <input ref={fileRef} type="file" className="hidden" onChange={onFile} />
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span>{error}</span><button onClick={() => setError(null)}>✕</button></div>}

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-600">Convocatoria</label>
        <select value={convId} onChange={e => setConvId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white max-w-xl focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Seleccionar convocatoria…</option>
          {convocatorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        {convId && !loading && (
          <span className="ml-auto text-xs text-gray-500">{students.length} postulante(s) · {completos} con expediente completo</span>
        )}
      </div>

      {convId && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="px-4 py-2 text-left sticky left-0 bg-gray-50">Postulante</th>
                  {types.map(t => (
                    <th key={t.id} className="px-3 py-2 text-center min-w-36">
                      <span className="inline-flex items-center gap-1">
                        {t.name}
                        <button onClick={() => renameType(t)} title="Renombrar" className="text-gray-300 hover:text-gray-600"><Pencil className="w-3 h-3" /></button>
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Avance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map(s => (
                  <tr key={s.enrollment_id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2 sticky left-0 bg-white">
                      <span className="text-gray-800">{s.student_name}</span>
                      <span className="block text-[11px] text-gray-400">{s.document_number} · {s.program_name}</span>
                    </td>
                    {types.map(t => {
                      const doc = s.docs.find(d => d.doc_type_id === t.id)
                      const key = `${s.enrollment_id}|${t.id}`
                      return (
                        <td key={t.id} className="px-3 py-2 text-center">
                          {doc ? (
                            <span className="inline-flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg px-2 py-1 max-w-40">
                              <FileCheck2 className="w-3.5 h-3.5 flex-shrink-0" />
                              {doc.url
                                ? <a href={doc.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline" title={`${doc.file_name ?? ''} · ${doc.uploaded_by ?? ''}`}>{doc.file_name ?? 'ver'}</a>
                                : <span className="truncate">{doc.file_name ?? 'archivo'}</span>}
                              <button onClick={() => pickFile(s.enrollment_id, t.id)} title="Reemplazar" className="text-blue-400 hover:text-blue-700"><Upload className="w-3 h-3" /></button>
                              <button onClick={() => removeDoc(doc.id)} title="Quitar" className="text-gray-300 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                            </span>
                          ) : (
                            <button onClick={() => pickFile(s.enrollment_id, t.id)} disabled={uploading === key}
                              className="inline-flex items-center gap-1.5 text-xs border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-600 rounded-lg px-2.5 py-1">
                              {uploading === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}Subir
                            </button>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right">
                      <span className={`text-xs font-semibold tabular-nums ${s.docs.length >= types.length ? 'text-green-600' : s.docs.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {s.docs.length}/{types.length}
                      </span>
                    </td>
                  </tr>
                ))}
                {!loading && students.length === 0 && (
                  <tr><td colSpan={types.length + 2} className="px-4 py-8 text-center text-xs text-gray-400">Sin postulantes en esta convocatoria.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
            Máximo 25 MB por archivo. Subir sobre un documento existente lo reemplaza. El lápiz en cada columna renombra el tipo de documento.
          </p>
        </div>
      )}

      {!convId && !loading && <p className="text-center text-xs text-gray-400 py-10">Elige una convocatoria para ver los expedientes de postulación.</p>}
    </div>
  )
}
