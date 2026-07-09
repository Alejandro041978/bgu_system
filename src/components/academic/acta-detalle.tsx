'use client'

import { useState } from 'react'
import { Search, Loader2, ChevronRight, ChevronDown } from 'lucide-react'

interface Slot { n: number; desc: string; pct: number | null; val: number | null }
interface Detail {
  id: string; program_name: string
  course_code: string | null; course_name: string | null
  term_year: number | null; term_block: string | null
  final_grade: number | null; retake_grade: number | null; makeup_grade: number | null
  extra_points: number | null; passing_score: number | null; max_score: number | null
  grades: Slot[] | null; process_grades: Slot[] | null
}
interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }

const g = (v: number | null) => (v == null ? '—' : Number(v).toFixed(2))

function statusOf(d: Detail): { label: string; cls: string } | null {
  const val = d.retake_grade ?? d.final_grade
  if (val == null) return { label: 'En curso', cls: 'bg-gray-100 text-gray-500' }
  if (d.passing_score == null) return null
  return val >= d.passing_score
    ? { label: 'Aprobado', cls: 'bg-green-50 text-green-700' }
    : { label: 'Desaprobado', cls: 'bg-red-50 text-red-700' }
}

export function ActaDetalle() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [student, setStudent] = useState<StudentHit | null>(null)
  const [details, setDetails] = useState<Detail[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())

  async function search(value: string) {
    setQ(value); setStudent(null); setDetails([])
    if (value.trim().length < 2) { setHits([]); return }
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(value.trim())}`).then(r => r.json())
    setHits(d.students ?? [])
  }

  async function selectStudent(h: StudentHit) {
    setStudent(h); setHits([]); setQ(h.name); setLoading(true); setOpen(new Set())
    const d = await fetch(`/api/academic/grade-details?student_id=${h.id}`).then(r => r.json())
    setDetails(d.details ?? []); setLoading(false)
  }

  function toggle(id: string) {
    setOpen(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // Agrupar por programa -> período
  const byProgram = new Map<string, Map<string, Detail[]>>()
  for (const d of details) {
    const term = `${d.term_year ?? '—'} · ${d.term_block ?? '—'}`
    if (!byProgram.has(d.program_name)) byProgram.set(d.program_name, new Map())
    const terms = byProgram.get(d.program_name)!
    if (!terms.has(term)) terms.set(term, [])
    terms.get(term)!.push(d)
  }

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

      {loading && <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>}

      {!loading && student && details.length === 0 && (
        <p className="text-sm text-gray-400 py-10 text-center">Sin detalle de calificaciones para este estudiante.</p>
      )}

      {!loading && [...byProgram.entries()].map(([prog, terms]) => (
        <div key={prog} className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900">{prog}</h2>
          {[...terms.entries()].map(([term, courses]) => (
            <div key={term} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">{term}</div>
              <div className="divide-y divide-gray-50">
                {courses.map(d => {
                  const st = statusOf(d)
                  const val = d.retake_grade ?? d.final_grade
                  const isOpen = open.has(d.id)
                  return (
                    <div key={d.id}>
                      <button onClick={() => toggle(d.id)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left">
                        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{d.course_name ?? d.course_code ?? '—'}</p>
                          {d.course_code && <p className="text-xs text-gray-400">{d.course_code}</p>}
                        </div>
                        <span className="text-sm font-semibold text-gray-900 w-12 text-right">{g(val)}</span>
                        {st && <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.cls}`}>{st.label}</span>}
                      </button>
                      {isOpen && <DetailPanel d={d} />}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function SlotTable({ title, slots }: { title: string; slots: Slot[] }) {
  if (!slots || slots.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1">{title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
            <th className="text-left px-2 py-1">Descripción</th>
            <th className="text-right px-2 py-1 w-16">Peso</th>
            <th className="text-right px-2 py-1 w-16">Nota</th>
          </tr>
        </thead>
        <tbody>
          {slots.map(s => (
            <tr key={s.n} className="border-t border-gray-50">
              <td className="px-2 py-1 text-gray-700">{s.desc}</td>
              <td className="px-2 py-1 text-right text-gray-400">{s.pct != null ? `${s.pct}%` : '—'}</td>
              <td className="px-2 py-1 text-right font-medium text-gray-800">{g(s.val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailPanel({ d }: { d: Detail }) {
  return (
    <div className="px-4 pb-4 pt-1 bg-gray-50/50 space-y-3">
      <SlotTable title="Notas principales" slots={d.grades ?? []} />
      <SlotTable title="Notas de proceso" slots={d.process_grades ?? []} />
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 pt-1">
        <span>Final: <b>{g(d.final_grade)}</b></span>
        {d.retake_grade != null && <span>Recuperación: <b>{g(d.retake_grade)}</b></span>}
        {d.makeup_grade != null && <span>Subsanación: <b>{g(d.makeup_grade)}</b></span>}
        {d.extra_points != null && d.extra_points !== 0 && <span>Puntos extra: <b>{g(d.extra_points)}</b></span>}
        {d.passing_score != null && <span>Nota aprobatoria: <b>{g(d.passing_score)}</b></span>}
        {d.max_score != null && <span>Máx: <b>{g(d.max_score)}</b></span>}
      </div>
    </div>
  )
}
