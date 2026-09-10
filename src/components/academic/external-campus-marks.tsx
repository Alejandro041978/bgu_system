'use client'

import { useEffect, useState } from 'react'
import { Search, Loader2, Globe, X, Plus } from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'

// ---------------------------------------------------------------------------
// Campus externo POR ESTUDIANTE (09/09/2026): un estudiante concreto cursa una
// asignatura fuera mientras sus compañeros la llevan en el aula de Moodle.
// Marcar el par: su nota se ingresa en esta página, el importador lo salta y
// el reconciliador lo excluye del aula (suspende si ya estaba).
// ---------------------------------------------------------------------------
interface Marcado {
  id: string; student_id: string; course_id: string
  student_name: string; document_number: string | null
  course: string; note: string | null; created_by: string | null; created_at: string
}
interface Hit { id: string; name: string; document_number: string | null }
interface Curso { id: string; code: string | null; name: string }

const API = '/api/academic/external-campus-grades'

export function ExternalCampusMarks() {
  // Cuatro ojos: marcar es un permiso distinto al de calificar. Quien no lo
  // tiene no ve esta sección — y aunque la forzara, el servidor la niega.
  const { loading: permsLoading, canView, canEdit } = usePermissions()
  const [marcados, setMarcados] = useState<Marcado[] | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [est, setEst] = useState<Hit | null>(null)
  const [cursos, setCursos] = useState<Curso[] | null>(null)
  const [cursoId, setCursoId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function cargar() {
    const d = await fetch(`${API}?vista=marcados`).then(r => r.json()).catch(() => ({}))
    setMarcados(d.marcados ?? [])
  }
  useEffect(() => { cargar() }, [])

  async function buscar() {
    if (!q.trim()) return
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(q.trim())}`).then(r => r.json()).catch(() => ({}))
    setHits(d.students ?? [])
  }
  async function elegir(h: Hit) {
    setEst(h); setHits([]); setCursos(null); setCursoId('')
    const d = await fetch(`${API}?vista=cursos&student_id=${h.id}`).then(r => r.json()).catch(() => ({}))
    setCursos(d.cursos ?? [])
  }
  async function marcar() {
    if (!est || !cursoId) return
    setBusy(true); setMsg(null)
    const d = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'marcar', student_id: est.id, course_id: cursoId, note }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setBusy(false)
    if (d.error) { setMsg({ kind: 'error', text: d.error }); return }
    setMsg({ kind: 'ok', text: d.aviso ?? 'Marcado' })
    setEst(null); setQ(''); setCursos(null); setCursoId(''); setNote('')
    cargar()
  }
  async function desmarcar(m: Marcado) {
    if (!confirm(`¿Quitar la marca de campus externo de ${m.student_name} en ${m.course}?\n\nEl importador volverá a considerar su aula de Moodle y el reconciliador podrá matricularlo de nuevo.`)) return
    setBusy(true); setMsg(null)
    const d = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'desmarcar', student_id: m.student_id, course_id: m.course_id }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setBusy(false)
    if (d.error) { setMsg({ kind: 'error', text: d.error }); return }
    setMsg({ kind: 'ok', text: d.aviso ?? 'Marca retirada' })
    cargar()
  }

  if (permsLoading || !canView('academic_external_campus_marks')) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl mt-6">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Globe className="w-4 h-4 text-sky-600" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">Estudiantes en campus externo</p>
          <p className="text-[11px] text-gray-400">
            Para asignaturas con aula de Moodle que un estudiante concreto cursa en otra institución: su nota se ingresa aquí, el importador lo salta y se le retira el aula. La calificación la registra otro colaborador: quien marca no califica.
          </p>
        </div>
        {canEdit('academic_external_campus_marks') && (
          <button onClick={() => setAbierto(a => !a)}
            className="inline-flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50">
            <Plus className="w-3 h-3" /> Marcar estudiante
          </button>
        )}
      </div>

      {msg && <p className={`mx-4 mt-3 text-xs rounded-md px-3 py-2 ${msg.kind === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</p>}

      {abierto && (
        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          {!est && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
                  placeholder="Buscar estudiante por nombre o documento…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <button onClick={buscar} className="px-3 py-2 bg-gray-900 text-white text-xs rounded-lg">Buscar</button>
            </div>
          )}
          {hits.length > 0 && !est && (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
              {hits.slice(0, 8).map(h => (
                <button key={h.id} onClick={() => elegir(h)} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                  {h.name} <span className="text-[11px] text-gray-400">{h.document_number ?? ''}</span>
                </button>
              ))}
            </div>
          )}
          {est && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-900">{est.name}</span>
                <span className="text-[11px] text-gray-400">{est.document_number ?? ''}</span>
                <button onClick={() => { setEst(null); setCursos(null) }} className="text-gray-400 hover:text-gray-700"><X className="w-3.5 h-3.5" /></button>
              </div>
              {!cursos ? <p className="text-xs text-gray-400"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Cargando sus asignaturas…</p> : (
                <>
                  <select value={cursoId} onChange={e => setCursoId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">Elegir la asignatura que cursa fuera…</option>
                    {cursos.map(c => <option key={c.id} value={c.id}>{[c.code, c.name].filter(Boolean).join(' · ')}</option>)}
                  </select>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Motivo / dónde la cursa (Coursera, TEP…) — opcional"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <button onClick={marcar} disabled={busy || !cursoId}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-xs font-medium rounded-lg">
                    {busy ? 'Marcando…' : 'Marcar como campus externo'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!marcados ? (
        <p className="px-4 py-4 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Cargando…</p>
      ) : marcados.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">Sin estudiantes marcados individualmente.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {marcados.map(m => (
            <li key={m.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="text-gray-800">{m.student_name} <span className="text-[11px] text-gray-400">{m.document_number ?? ''}</span></p>
                <p className="text-[11px] text-gray-400">
                  {m.course}{m.note ? ` · ${m.note}` : ''} · marcado el {new Date(m.created_at).toLocaleDateString('es-PE')}{m.created_by ? ` por ${m.created_by}` : ''}
                </p>
              </div>
              {canEdit('academic_external_campus_marks') && (
                <button onClick={() => desmarcar(m)} disabled={busy}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
