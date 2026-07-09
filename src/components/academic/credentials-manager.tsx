'use client'

import { useState } from 'react'
import { Upload, FileText, CheckCircle2, XCircle, Clock, Loader2, Download, AlertCircle, GraduationCap, Sparkles, Trash2, X, ClipboardCheck } from 'lucide-react'

type Credential = {
  id: string
  employee_id: string
  cv_url: string | null
  cv_name: string | null
  degree_url: string | null
  degree_name: string | null
  second_title_url: string | null
  second_title_name: string | null
  status: 'pending' | 'evaluating' | 'approved' | 'rejected'
  approved_level: 'bachelor' | 'master' | 'doctor' | null
  ai_report: string | null
  evaluated_at: string | null
  source?: 'ai' | 'external' | null
  external_report_url?: string | null
  external_report_name?: string | null
}

type Faculty = {
  id: string
  full_name: string
  email: string
  position: string | null
  credential: Credential | null
}

const LEVEL_LABEL: Record<string, string> = {
  bachelor: 'Pregrado / Bachelor',
  master: 'Maestría / Master',
  doctor: 'Doctorado',
}

const LEVEL_COLOR: Record<string, string> = {
  bachelor: 'bg-blue-50 text-blue-700 border-blue-200',
  master: 'bg-purple-50 text-purple-700 border-purple-200',
  doctor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

function StatusBadge({ status, level }: { status: Credential['status']; level: Credential['approved_level'] }) {
  if (status === 'approved') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
          <CheckCircle2 className="w-3 h-3" /> Aprobado
        </span>
        {level && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${LEVEL_COLOR[level]}`}>
            {LEVEL_LABEL[level]}
          </span>
        )}
      </div>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
        <XCircle className="w-3 h-3" /> Rechazado
      </span>
    )
  }
  if (status === 'evaluating') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
        <Loader2 className="w-3 h-3 animate-spin" /> Evaluando…
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">
      <Clock className="w-3 h-3" /> Pendiente
    </span>
  )
}

function FileSlot({
  label,
  url,
  name,
  hint,
  employeeId,
  fileType,
  onUploaded,
}: {
  label: string
  url: string | null
  name: string | null
  hint: string
  employeeId: string
  fileType: 'cv' | 'degree' | 'second_title'
  onUploaded: (url: string, name: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('employee_id', employeeId)
    fd.append('file_type', fileType)
    const res = await fetch('/api/academic/credentials/upload', { method: 'POST', body: fd })
    const data = await res.json()
    setUploading(false)
    if (!res.ok) { setError(data.error); return }
    onUploaded(data.url, data.name)
    e.target.value = ''
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-700">{label}</p>
      <p className="text-xs text-gray-400">{hint}</p>
      {url ? (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 border border-green-200">
          <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-green-700 font-medium truncate hover:underline flex-1">
            {name ?? 'archivo'}
          </a>
          <label className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">
            <Upload className="w-3.5 h-3.5" />
            <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFile} />
          </label>
        </div>
      ) : (
        <label className={`flex items-center gap-2 p-2.5 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${uploading ? 'border-blue-200 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}>
          {uploading
            ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            : <Upload className="w-4 h-4 text-gray-400" />}
          <span className="text-xs text-gray-500">{uploading ? 'Subiendo…' : 'Subir archivo (PDF, DOC)'}</span>
          <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function CredentialsManager({ faculty: initialFaculty }: { faculty: Faculty[] }) {
  const [faculty, setFaculty] = useState(initialFaculty)
  const [evaluating, setEvaluating] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [evalError, setEvalError] = useState<Record<string, string>>({})
  const [openReport, setOpenReport] = useState<Record<string, boolean>>({})
  const [extModal, setExtModal] = useState<string | null>(null)
  const [extStatus, setExtStatus] = useState<'approved' | 'rejected'>('approved')
  const [extLevel, setExtLevel] = useState<'bachelor' | 'master' | 'doctor'>('bachelor')
  const [extFile, setExtFile] = useState<File | null>(null)
  const [extSaving, setExtSaving] = useState(false)

  async function deleteEvaluation(f: Faculty) {
    if (!f.credential?.id) return
    if (!confirm('¿Borrar la evaluación? Se eliminan el reporte, los documentos cargados y el estado. Esta acción no se puede deshacer.')) return
    const res = await fetch(`/api/academic/credentials/${f.credential.id}`, { method: 'DELETE' })
    if (res.ok) setFaculty(prev => prev.map(x => x.id === f.id ? { ...x, credential: null } : x))
    else { const d = await res.json().catch(() => null); alert(`No se pudo borrar: ${d?.error ?? 'error'}`) }
  }

  function openExternal(fId: string) {
    setExtModal(fId); setExtStatus('approved'); setExtLevel('bachelor'); setExtFile(null)
  }
  async function submitExternal() {
    if (!extModal) return
    setExtSaving(true)
    const fd = new FormData()
    fd.append('employee_id', extModal)
    fd.append('status', extStatus)
    if (extStatus === 'approved') fd.append('approved_level', extLevel)
    if (extFile) fd.append('file', extFile)
    const res = await fetch('/api/academic/credentials/external', { method: 'POST', body: fd })
    const data = await res.json()
    setExtSaving(false)
    if (!res.ok) { alert(`No se pudo guardar: ${data?.error ?? 'error'}`); return }
    updateCredential(extModal, {
      id: data.id, status: data.status, approved_level: data.approved_level,
      source: 'external', external_report_url: data.external_report_url, external_report_name: data.external_report_name,
      ai_report: null, evaluated_at: data.evaluated_at,
    })
    setExtModal(null); setExtFile(null)
  }

  function updateCredential(employeeId: string, patch: Partial<Credential>) {
    setFaculty(prev => prev.map(f => {
      if (f.id !== employeeId) return f
      const cred = f.credential ?? {
        id: '', employee_id: employeeId,
        cv_url: null, cv_name: null,
        degree_url: null, degree_name: null,
        second_title_url: null, second_title_name: null,
        status: 'pending' as const,
        approved_level: null, ai_report: null, evaluated_at: null,
        source: 'ai' as const, external_report_url: null, external_report_name: null,
      }
      return { ...f, credential: { ...cred, ...patch } }
    }))
  }

  async function evaluate(f: Faculty) {
    if (!f.credential?.cv_url && !f.credential?.degree_url) {
      setEvalError(prev => ({ ...prev, [f.id]: 'Sube al menos el CV y el grado principal antes de evaluar.' }))
      return
    }
    setEvalError(prev => ({ ...prev, [f.id]: '' }))
    setEvaluating(prev => ({ ...prev, [f.id]: true }))
    updateCredential(f.id, { status: 'evaluating' })

    const credId = f.credential?.id
    if (!credId) {
      setEvaluating(prev => ({ ...prev, [f.id]: false }))
      return
    }

    const res = await fetch(`/api/academic/credentials/evaluate/${credId}`, { method: 'POST' })
    const data = await res.json()
    setEvaluating(prev => ({ ...prev, [f.id]: false }))

    if (!res.ok) {
      setEvalError(prev => ({ ...prev, [f.id]: data.error ?? 'Error en evaluación' }))
      updateCredential(f.id, { status: 'pending' })
      return
    }
    updateCredential(f.id, { status: data.status, approved_level: data.approved_level, ai_report: data.ai_report ?? null, evaluated_at: data.evaluated_at ?? new Date().toISOString() })
  }

  const approved = faculty.filter(f => f.credential?.status === 'approved')
  const rejected = faculty.filter(f => f.credential?.status === 'rejected')
  const pending = faculty.filter(f => !f.credential?.status || f.credential.status === 'pending' || f.credential.status === 'evaluating')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Credenciales Docentes</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gestión de documentos y evaluación de idoneidad académica (AACRAO EDGE)
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{approved.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Aprobados</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-400">{pending.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Pendientes</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{rejected.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Rechazados</p>
        </div>
      </div>

      {/* Faculty list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {faculty.map(f => {
            const cred = f.credential
            const isOpen = expanded[f.id]
            const isEval = evaluating[f.id] || cred?.status === 'evaluating'
            const canEvaluate = !!(cred?.cv_url || cred?.degree_url) && !isEval
            const evaluated = cred?.status === 'approved' || cred?.status === 'rejected'

            return (
              <div key={f.id}>
                {/* Row header */}
                <button
                  onClick={() => setExpanded(prev => ({ ...prev, [f.id]: !prev[f.id] }))}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {f.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{f.full_name}</p>
                      <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                        <GraduationCap className="w-3 h-3" /> Faculty
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{f.email}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusBadge status={cred?.status ?? 'pending'} level={cred?.approved_level ?? null} />
                    <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded panel */}
                {isOpen && (
                  <div className="px-6 pb-6 border-t border-gray-50 bg-gray-50/50">
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FileSlot
                        label="CV Documentado *"
                        hint="Currículum vitae completo con formación y experiencia"
                        url={cred?.cv_url ?? null}
                        name={cred?.cv_name ?? null}
                        employeeId={f.id}
                        fileType="cv"
                        onUploaded={(url, name) => updateCredential(f.id, { cv_url: url, cv_name: name })}
                      />
                      <FileSlot
                        label="Grado de Mayor Jerarquía *"
                        hint="Diploma o certificado del grado académico más alto"
                        url={cred?.degree_url ?? null}
                        name={cred?.degree_name ?? null}
                        employeeId={f.id}
                        fileType="degree"
                        onUploaded={(url, name) => updateCredential(f.id, { degree_url: url, degree_name: name })}
                      />
                      <FileSlot
                        label="Segundo Título (opcional)"
                        hint="Diploma adicional, especialización o certificación"
                        url={cred?.second_title_url ?? null}
                        name={cred?.second_title_name ?? null}
                        employeeId={f.id}
                        fileType="second_title"
                        onUploaded={(url, name) => updateCredential(f.id, { second_title_url: url, second_title_name: name })}
                      />
                    </div>

                    {evalError[f.id] && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {evalError[f.id]}
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                      {!evaluated ? (
                        <>
                          <button
                            onClick={() => evaluate(f)}
                            disabled={!canEvaluate}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {isEval
                              ? <><Loader2 className="w-4 h-4 animate-spin" /> Evaluando con IA…</>
                              : <><Sparkles className="w-4 h-4" /> Solicitar Evaluación IA</>
                            }
                          </button>
                          <button
                            onClick={() => openExternal(f.id)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <ClipboardCheck className="w-4 h-4" /> Subir evaluación externa
                          </button>
                        </>
                      ) : (
                        <>
                          {cred?.source === 'external'
                            ? (cred?.external_report_url && (
                                <a href={cred.external_report_url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                                  <Download className="w-4 h-4" /> Descargar dictamen
                                </a>
                              ))
                            : (cred?.ai_report && cred.id && (
                                <>
                                  <button
                                    onClick={() => setOpenReport(prev => ({ ...prev, [f.id]: !prev[f.id] }))}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    <FileText className="w-4 h-4" /> {openReport[f.id] ? 'Ocultar reporte' : 'Ver reporte'}
                                  </button>
                                  <a href={`/api/academic/credentials/report/${cred.id}`} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                                    <Download className="w-4 h-4" /> Descargar Reporte
                                  </a>
                                </>
                              ))}
                          <button
                            onClick={() => deleteEvaluation(f)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" /> Borrar evaluación
                          </button>
                        </>
                      )}
                    </div>

                    {openReport[f.id] && cred?.ai_report && (
                      <pre className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-700 whitespace-pre-wrap font-sans overflow-x-auto max-h-[28rem] overflow-y-auto">{cred.ai_report}</pre>
                    )}

                    {cred?.evaluated_at && (
                      <p className="mt-2 text-xs text-gray-400">
                        Evaluado: {new Date(cred.evaluated_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {' · '}{cred.source === 'external' ? 'Evaluación externa' : 'Evaluación IA'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {faculty.length === 0 && (
            <div className="py-16 text-center">
              <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No hay colaboradores marcados como Faculty.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: evaluación externa */}
      {extModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setExtModal(null)}>
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-indigo-600" /> Evaluación externa</h3>
              <button onClick={() => setExtModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500">Registra un dictamen previo sin pasar por la evaluación IA. El docente queda en el estado que elijas.</p>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Resultado</label>
              <div className="flex gap-2">
                <button onClick={() => setExtStatus('approved')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${extStatus === 'approved' ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  Aprobado
                </button>
                <button onClick={() => setExtStatus('rejected')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${extStatus === 'rejected' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  Desaprobado
                </button>
              </div>
            </div>

            {extStatus === 'approved' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nivel autorizado</label>
                <select value={extLevel} onChange={e => setExtLevel(e.target.value as 'bachelor' | 'master' | 'doctor')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="bachelor">Pregrado / Bachelor</option>
                  <option value="master">Maestría / Master (y pregrado)</option>
                  <option value="doctor">Doctorado (todos los niveles)</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dictamen (PDF/Word, opcional)</label>
              <input type="file" accept=".pdf,.doc,.docx" onChange={e => setExtFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:text-sm" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setExtModal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">Cancelar</button>
              <button onClick={submitExternal} disabled={extSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white">
                {extSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Guardar evaluación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
