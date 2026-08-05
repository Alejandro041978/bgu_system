'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Upload, FileText, ChevronRight, Trash2, Search, History } from 'lucide-react'

interface Program { id: string; name: string; code: string | null }
interface Semester { id: string; name: string; start_date: string | null }
interface Syllabus {
  id: string; semester_id: string; semester: string; semester_start: string | null
  file_name: string | null; file_size: number | null; note: string | null; uploaded_at: string
}
interface Course {
  id: string; name: string; code: string | null; credits: number | null
  syllabi: Syllabus[]; vigente_id: string | null
}

const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')
const peso = (n: number | null) => (n ? `${(n / 1024 / 1024).toFixed(1)} MB` : '')

export function SyllabiView() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [progId, setProgId] = useState('')
  const [q, setQ] = useState('')
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/academic/syllabi').then(r => r.json()).then(d => {
      setPrograms(d.programs ?? []); setSemesters(d.semesters ?? [])
    }).catch(() => {})
  }, [])

  const cargar = useCallback(async (id: string) => {
    if (!id) { setCourses(null); return }
    setCourses(null)
    const d = await fetch(`/api/academic/syllabi?program_id=${id}`).then(r => r.json())
    setCourses(d.courses ?? [])
  }, [])
  useEffect(() => { cargar(progId) }, [progId, cargar])

  async function abrir(id: string) {
    const d = await fetch(`/api/academic/syllabi/${id}/file`).then(r => r.json())
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    window.open(d.url, '_blank', 'noopener')
  }

  async function borrar(s: Syllabus) {
    if (!confirm(`¿Eliminar el sílabo con vigencia desde ${s.semester}? El histórico es la memoria de qué se enseñó y cuándo.`)) return
    const d = await fetch('/api/academic/syllabi', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }),
    }).then(r => r.json())
    if (d.error) { setNotice({ kind: 'error', text: d.error }); return }
    setNotice({ kind: 'ok', text: 'Sílabo eliminado' })
    cargar(progId)
  }

  const filtradas = (courses ?? []).filter(c => {
    const t = q.trim().toLowerCase()
    return !t || c.name.toLowerCase().includes(t) || (c.code ?? '').toLowerCase().includes(t)
  })
  const conSilabo = (courses ?? []).filter(c => c.syllabi.length > 0).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select value={progId} onChange={e => { setProgId(e.target.value); setAbierta(null) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white flex-1 min-w-64">
          <option value="">Elige un programa…</option>
          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {progId && (
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar asignatura…"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm" />
          </div>
        )}
      </div>

      {notice && (
        <p className={`text-sm ${notice.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{notice.text}</p>
      )}

      {!progId ? (
        <p className="text-sm text-gray-400 py-12 text-center">
          Elige un programa para ver sus asignaturas y los sílabos de cada una.
        </p>
      ) : courses === null ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            {courses.length} asignatura(s) · <strong>{conSilabo}</strong> con sílabo cargado
          </p>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {filtradas.map(c => {
              const v = c.syllabi.find(s => s.id === c.vigente_id) ?? null
              const futuros = c.syllabi.filter(s => s.semester_start && s.semester_start > new Date().toISOString().slice(0, 10))
              const abierto = abierta === c.id
              return (
                <div key={c.id}>
                  <button onClick={() => setAbierta(abierto ? null : c.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${abierto ? 'rotate-90' : ''}`} />
                    <span className="text-xs text-gray-400 font-mono w-14 shrink-0">{c.code ?? '—'}</span>
                    <span className="text-sm text-gray-800 flex-1">{c.name}</span>
                    {v ? (
                      <span className="text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                        Vigente desde {v.semester}
                      </span>
                    ) : futuros.length ? (
                      <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        Programado · {futuros[futuros.length - 1].semester}
                      </span>
                    ) : (
                      <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Sin sílabo</span>
                    )}
                    {c.syllabi.length > 1 && (
                      <span className="text-[11px] text-gray-400 inline-flex items-center gap-1">
                        <History className="w-3 h-3" /> {c.syllabi.length}
                      </span>
                    )}
                  </button>

                  {abierto && (
                    <div className="px-4 pb-4 pl-11 space-y-3">
                      {c.syllabi.length === 0 ? (
                        <p className="text-xs text-gray-400">Todavía no hay sílabos para esta asignatura.</p>
                      ) : (
                        <div className="space-y-1">
                          {c.syllabi.map(s => (
                            <div key={s.id} className="flex items-center gap-2 text-sm">
                              <FileText className={`w-4 h-4 shrink-0 ${s.id === c.vigente_id ? 'text-green-600' : 'text-gray-300'}`} />
                              <button onClick={() => abrir(s.id)} className="text-blue-600 hover:text-blue-800 text-left">
                                {s.file_name ?? 'sílabo.pdf'}
                              </button>
                              <span className="text-xs text-gray-500">desde {s.semester}</span>
                              {s.id === c.vigente_id && <span className="text-[10px] text-green-700">vigente</span>}
                              <span className="text-[11px] text-gray-300 ml-auto">
                                {peso(s.file_size)} · subido {fdate(s.uploaded_at)}
                              </span>
                              <button onClick={() => borrar(s)} className="text-gray-300 hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <SubirSilabo courseId={c.id} semesters={semesters}
                        onDone={m => { setNotice({ kind: 'ok', text: m }); cargar(progId) }}
                        onError={m => setNotice({ kind: 'error', text: m })} />
                    </div>
                  )}
                </div>
              )
            })}
            {filtradas.length === 0 && <p className="text-sm text-gray-400 px-4 py-6">Sin asignaturas que coincidan.</p>}
          </div>
        </>
      )}
    </div>
  )
}

// El semestre de vigencia es obligatorio y va DELANTE del archivo: un sílabo
// sin "desde cuándo rige" no se puede colocar en la historia de la asignatura,
// que es justamente para lo que se guarda.
function SubirSilabo(
  { courseId, semesters, onDone, onError }:
  { courseId: string; semesters: Semester[]; onDone: (m: string) => void; onError: (m: string) => void }
) {
  const [semId, setSemId] = useState('')
  const [note, setNote] = useState('')
  const [subiendo, setSubiendo] = useState(false)

  async function subir(file: File) {
    setSubiendo(true)
    const fd = new FormData()
    fd.append('course_id', courseId); fd.append('semester_id', semId); fd.append('file', file)
    if (note.trim()) fd.append('note', note.trim())
    const d = await fetch('/api/academic/syllabi', { method: 'POST', body: fd })
      .then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setSubiendo(false)
    if (d.error) { onError(d.error); return }
    setSemId(''); setNote('')
    onDone(d.reemplazado
      ? `Sílabo de ${d.semestre} reemplazado`
      : `Sílabo cargado con vigencia desde ${d.semestre}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
      <select value={semId} onChange={e => setSemId(e.target.value)}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
        <option value="">Vigente desde…</option>
        {semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nota (opcional)"
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-44" />
      <label className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer
        ${semId && !subiendo ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
        {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {subiendo ? 'Subiendo…' : 'Subir PDF'}
        <input type="file" accept="application/pdf" className="hidden" disabled={!semId || subiendo}
          onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
      </label>
      {!semId && <span className="text-[11px] text-gray-400">Elige primero desde qué semestre rige.</span>}
    </div>
  )
}
