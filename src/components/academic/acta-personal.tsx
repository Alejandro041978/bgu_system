'use client'

import { useState } from 'react'
import { Search, User, Loader2, FileText } from 'lucide-react'

interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }
interface Program { id: string; name: string }
interface Row { code: string | null; name: string; credits: number | null; status: string; grade: number | null }
interface Summary { transfer: number; validation: number; aprobado: number; desaprobado: number; en_proceso: number; pendiente: number; total: number }
interface Acta { student: { name: string; document: string | null }; program: { name: string }; courses: Row[]; summary: Summary }

const STATUS: Record<string, { label: string; cls: string }> = {
  transfer:    { label: 'Transfer Credit', cls: 'bg-indigo-50 text-indigo-700' },
  validation:  { label: 'Validation',      cls: 'bg-purple-50 text-purple-700' },
  aprobado:    { label: 'Aprobado',        cls: 'bg-green-50 text-green-700' },
  desaprobado: { label: 'Desaprobado',     cls: 'bg-red-50 text-red-700' },
  en_proceso:  { label: 'En proceso',      cls: 'bg-amber-50 text-amber-700' },
  pendiente:   { label: 'Pendiente',       cls: 'bg-gray-100 text-gray-500' },
}

export function ActaPersonal() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [student, setStudent] = useState<StudentHit | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [programId, setProgramId] = useState('')
  const [acta, setActa] = useState<Acta | null>(null)
  const [loading, setLoading] = useState(false)

  async function search(value: string) {
    setQ(value); setStudent(null); setActa(null); setPrograms([]); setProgramId('')
    if (value.trim().length < 2) { setHits([]); return }
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(value.trim())}`).then(r => r.json())
    setHits(d.students ?? [])
  }

  async function loadActa(sid: string, pid: string) {
    setLoading(true)
    const d = await fetch(`/api/academic/acta?student_id=${sid}&program_id=${pid}`).then(r => r.json())
    setActa(d.error ? null : d); setLoading(false)
  }

  async function selectStudent(h: StudentHit) {
    setStudent(h); setHits([]); setQ(h.name); setActa(null); setProgramId('')
    const d = await fetch(`/api/students/${h.id}/programs`).then(r => r.json()).catch(() => ({ programs: [] }))
    const progs: Program[] = d.programs ?? []
    setPrograms(progs)
    if (progs.length >= 1) { setProgramId(progs[0].id); loadActa(h.id, progs[0].id) }
  }

  function pickProgram(pid: string) {
    setProgramId(pid)
    if (student && pid) loadActa(student.id, pid)
  }

  const chips: [string, number, string][] = acta ? [
    ['Transfer Credit', acta.summary.transfer, 'bg-indigo-50 text-indigo-700 border-indigo-100'],
    ['Validation', acta.summary.validation, 'bg-purple-50 text-purple-700 border-purple-100'],
    ['Aprobadas', acta.summary.aprobado, 'bg-green-50 text-green-700 border-green-100'],
    ['Desaprobadas', acta.summary.desaprobado, 'bg-red-50 text-red-700 border-red-100'],
    ['En Proceso', acta.summary.en_proceso, 'bg-amber-50 text-amber-700 border-amber-100'],
    ['Pendientes', acta.summary.pendiente, 'bg-gray-50 text-gray-600 border-gray-200'],
    ['Total', acta.summary.total, 'bg-blue-600 text-white border-blue-600'],
  ] : []

  return (
    <div className="space-y-4">
      {/* Buscador */}
      <div className="relative">
        <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 shadow-sm">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={e => search(e.target.value)} placeholder="Buscar estudiante por nombre o documento…"
            className="flex-1 px-3 py-3 text-sm focus:outline-none" />
        </div>
        {hits.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
            {hits.map(h => (
              <button key={h.id} onClick={() => selectStudent(h)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                <p className="text-sm text-gray-800">{h.name}</p>
                <p className="text-xs text-gray-400">{h.document_number ?? h.email}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cabecera estudiante + selector de programa */}
      {student && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{student.name}</p>
              <p className="text-xs text-gray-400">Documento: {student.document_number ?? '—'}</p>
            </div>
          </div>
          {programs.length > 1 && (
            <select value={programId} onChange={e => pickProgram(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {programs.length === 1 && <span className="text-sm text-gray-600">{programs[0].name}</span>}
        </div>
      )}

      {loading && <div className="bg-white rounded-xl border border-gray-200 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {student && !loading && programs.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-400">
          Este estudiante no tiene programa matriculado registrado.
        </div>
      )}

      {acta && !loading && (
        <>
          {/* Resumen */}
          <div className="flex flex-wrap gap-2">
            {chips.map(([label, n, cls]) => (
              <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cls}`}>
                <span className="text-lg font-bold leading-none">{n}</span>
                <span className="text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>

          {/* Tabla de la malla */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Asignatura</th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Cr.</th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Nota</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {acta.courses.map((c, i) => {
                  const st = STATUS[c.status] ?? STATUS.pendiente
                  return (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-800">{c.name}</p>
                        {c.code && <p className="text-xs text-gray-400">{c.code}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{c.credits ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        {c.grade != null
                          ? <span className={`font-semibold ${c.status === 'desaprobado' ? 'text-red-600' : c.status === 'transfer' ? 'text-indigo-600' : c.status === 'validation' ? 'text-purple-600' : 'text-gray-800'}`}>{c.grade}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {acta.courses.length === 0 && (
              <p className="text-center text-gray-400 py-10 text-sm">El programa no tiene asignaturas registradas en la malla.</p>
            )}
          </div>
        </>
      )}

      {!student && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-20 text-center text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3" />
          <p className="text-sm">Busca un estudiante para ver su acta personal</p>
        </div>
      )}
    </div>
  )
}
