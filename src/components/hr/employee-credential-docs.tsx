'use client'

import { useState } from 'react'
import { FileText, Download, Upload, X, Loader2 } from 'lucide-react'

interface Doc { url: string; name: string }
interface Cred {
  cv_url: string | null; cv_name: string | null
  degree_url: string | null; degree_name: string | null
  second_title_url: string | null; second_title_name: string | null
  external_report_url: string | null; external_report_name: string | null
  additional_documents: Doc[] | null
}

export function EmployeeCredentialDocs({ employeeId, cred }: { employeeId: string; cred: Cred | null }) {
  const [additional, setAdditional] = useState<Doc[]>(cred?.additional_documents ?? [])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fixed = [
    { label: 'CV Documentado', url: cred?.cv_url, name: cred?.cv_name },
    { label: 'Grado de Mayor Jerarquía', url: cred?.degree_url, name: cred?.degree_name },
    { label: 'Segundo Título', url: cred?.second_title_url, name: cred?.second_title_name },
    { label: 'Dictamen externo', url: cred?.external_report_url, name: cred?.external_report_name },
  ].filter(d => d.url)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    const fd = new FormData(); fd.append('file', file); fd.append('employee_id', employeeId)
    const res = await fetch('/api/academic/credentials/documents', { method: 'POST', body: fd })
    const data = await res.json()
    setUploading(false); e.target.value = ''
    if (!res.ok) { setError(data.error ?? 'Error al subir'); return }
    setAdditional(data.additional_documents ?? [])
  }
  async function remove(url: string) {
    const d = await fetch(`/api/academic/credentials/documents?employee_id=${employeeId}&url=${encodeURIComponent(url)}`, { method: 'DELETE' }).then(r => r.json())
    setAdditional(d.additional_documents ?? additional.filter(x => x.url !== url))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Documentos de credenciales</h2>

      {fixed.length === 0 ? (
        <p className="text-xs text-gray-400">Sin documentos cargados en la revisión de credenciales.</p>
      ) : (
        <div className="space-y-1.5">
          {fixed.map((d, i) => (
            <div key={i} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400">{d.label}</p>
                  <p className="text-sm text-gray-700 truncate">{d.name ?? 'documento'}</p>
                </div>
              </div>
              <a href={d.url!} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 shrink-0"><Download className="w-4 h-4" /></a>
            </div>
          ))}
        </div>
      )}

      <div className="pt-1">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold text-gray-600">Documentos adicionales ({additional.length}/3)</h3>
          {additional.length < 3 && (
            <label className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Subir documento
              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={upload} className="hidden" disabled={uploading} />
            </label>
          )}
        </div>
        {error && <p className="text-xs text-red-600 mb-1.5">{error}</p>}
        {additional.length === 0 ? (
          <p className="text-xs text-gray-400">Sin documentos adicionales.</p>
        ) : (
          <div className="space-y-1.5">
            {additional.map((d, i) => (
              <div key={i} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  <p className="text-sm text-gray-700 truncate">{d.name}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600"><Download className="w-4 h-4" /></a>
                  <button onClick={() => remove(d.url)} className="text-gray-300 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
