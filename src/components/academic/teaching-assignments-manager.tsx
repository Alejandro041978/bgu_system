'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, UserCheck, X, CalendarDays, AlertCircle, CheckCircle2 } from 'lucide-react'

interface Ref { id: string; name: string; category_id?: string | null }
interface Contract { start_date: string | null; end_date: string | null }
interface Fac { id: string; full_name: string; position: string | null; approved: boolean; contracts: Contract[] }
interface Assign { id: string; hours_per_week: number | null; employee_id: string; employee_name: string }
interface Off {
  id: string; course_name: string; course_code: string | null; semester_name: string
  start_date: string | null; end_date: string | null; assignments: Assign[]
}

const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')

function coversPeriod(c: Contract, o: Off): boolean {
  if (o.start_date && o.end_date) return !!(c.start_date && c.end_date && c.start_date <= o.start_date && c.end_date >= o.end_date)
  return true // sin fechas de asignatura no se puede verificar cobertura
}
function eligible(f: Fac, o: Off): boolean {
  return f.approved && f.contracts.some(c => coversPeriod(c, o))
}

export function TeachingAssignmentsManager() {
  const [categories, setCategories] = useState<Ref[]>([])
  const [programs, setPrograms] = useState<Ref[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [programId, setProgramId] = useState('')
  const [offerings, setOfferings] = useState<Off[]>([])
  const [faculty, setFaculty] = useState<Fac[]>([])
  const [loading, setLoading] = useState(false)
  const [pick, setPick] = useState<Record<string, { employee_id: string; hours: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const loadCatalogs = useCallback(async () => {
    const d = await fetch('/api/academic/teaching-assignments').then(r => r.json())
    setCategories(d.categories ?? []); setPrograms(d.programs ?? [])
  }, [])
  useEffect(() => { loadCatalogs() }, [loadCatalogs])

  const load = useCallback(async (prog: string) => {
    if (!prog) { setOfferings([]); setFaculty([]); return }
    setLoading(true)
    const d = await fetch(`/api/academic/teaching-assignments?program_id=${prog}`).then(r => r.json())
    setOfferings(d.offerings ?? []); setFaculty(d.faculty ?? []); setLoading(false)
  }, [])
  useEffect(() => { load(programId) }, [programId, load])

  const catPrograms = programs.filter(p => !categoryId || p.category_id === categoryId)

  async function assign(o: Off) {
    const p = pick[o.id]
    if (!p?.employee_id) return
    setBusy(o.id)
    await fetch('/api/academic/assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offering_id: o.id, employee_id: p.employee_id, hours_per_week: p.hours ? parseInt(p.hours) : null }),
    })
    setPick(prev => ({ ...prev, [o.id]: { employee_id: '', hours: '' } }))
    setBusy(null); load(programId)
  }
  async function remove(assignId: string) {
    await fetch(`/api/academic/assignments/${assignId}`, { method: 'DELETE' }); load(programId)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs text-gray-500 mb-1">Categoría</span>
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setProgramId('') }} className={inp}>
            <option value="">Seleccionar…</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs text-gray-500 mb-1">Programa</span>
          <select value={programId} onChange={e => setProgramId(e.target.value)} className={inp} disabled={!categoryId}>
            <option value="">Seleccionar…</option>
            {catPrograms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      {!programId ? (
        <p className="text-sm text-gray-400 py-10 text-center">Selecciona categoría y programa para asignar docentes.</p>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : offerings.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">Este programa no tiene asignaturas en la oferta.</p>
      ) : (
        <div className="space-y-3">
          {offerings.map(o => {
            const p = pick[o.id] ?? { employee_id: '', hours: '' }
            return (
              <div key={o.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{o.course_name}</p>
                    <p className="text-xs text-gray-400">{o.course_code ?? '—'} · {o.semester_name}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><CalendarDays className="w-3 h-3" />{fdate(o.start_date)} — {fdate(o.end_date)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {o.assignments.length > 0 ? o.assignments.map(a => (
                      <span key={a.id} className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                        <UserCheck className="w-3 h-3" />{a.employee_name}{a.hours_per_week ? <span className="text-indigo-400">· {a.hours_per_week}h</span> : null}
                        <button onClick={() => remove(a.id)} className="ml-0.5 hover:text-red-500"><X className="w-3 h-3" /></button>
                      </span>
                    )) : (
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full"><AlertCircle className="w-3.5 h-3.5" />Sin docente</span>
                    )}
                  </div>
                </div>

                {/* Asignar */}
                <div className="mt-3 flex items-center gap-2 flex-wrap border-t border-gray-50 pt-3">
                  <select value={p.employee_id} onChange={e => setPick(prev => ({ ...prev, [o.id]: { ...p, employee_id: e.target.value } }))}
                    className={`${inp} flex-1 min-w-[240px]`}>
                    <option value="">— Seleccionar docente elegible —</option>
                    {faculty.map(f => {
                      const already = o.assignments.some(a => a.employee_id === f.id)
                      const elig = eligible(f, o)
                      const reason = already ? '(ya asignado)' : !f.approved ? '(sin credencial aprobada)' : !elig ? '(contrato no cubre el período)' : ''
                      return <option key={f.id} value={f.id} disabled={already || !elig}>{f.full_name}{f.position ? ` — ${f.position}` : ''} {reason}</option>
                    })}
                  </select>
                  <input type="number" min="1" max="40" value={p.hours} onChange={e => setPick(prev => ({ ...prev, [o.id]: { ...p, hours: e.target.value } }))}
                    placeholder="Horas/sem" className={`${inp} w-28`} />
                  <button onClick={() => assign(o)} disabled={!p.employee_id || busy === o.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white">
                    {busy === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Asignar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inp = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
