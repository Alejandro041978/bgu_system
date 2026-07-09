'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, X, Search, Loader2, BookOpen, Users, UserCheck } from 'lucide-react'

interface Off { id: string; course_name: string; course_code: string | null; teacher: string | null }
interface Stu { id: string; name: string; document_number: string | null }
interface Data { group: { id: string; name: string; semester_name: string }; offerings: Off[]; available: Off[]; students: Stu[] }

export function GroupDetail({ groupId }: { groupId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [addingOff, setAddingOff] = useState('')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Stu[]>([])

  const load = useCallback(async () => {
    const d = await fetch(`/api/academic/groups/${groupId}`).then(r => r.json())
    setData(d.error ? null : d); setLoading(false)
  }, [groupId])
  useEffect(() => { load() }, [load])

  async function addOffering(offeringId: string) {
    if (!offeringId) return
    await fetch(`/api/academic/groups/${groupId}/offerings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offering_id: offeringId }),
    })
    setAddingOff(''); load()
  }
  async function removeOffering(offeringId: string) {
    await fetch(`/api/academic/groups/${groupId}/offerings?offering_id=${offeringId}`, { method: 'DELETE' }); load()
  }

  async function searchStudents(value: string) {
    setQ(value)
    if (value.trim().length < 2) { setHits([]); return }
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(value.trim())}`).then(r => r.json())
    setHits(d.students ?? [])
  }
  async function addStudent(s: Stu) {
    setQ(''); setHits([])
    await fetch(`/api/academic/groups/${groupId}/students`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: s.id }),
    })
    load()
  }
  async function removeStudent(studentId: string) {
    await fetch(`/api/academic/groups/${groupId}/students?student_id=${studentId}`, { method: 'DELETE' }); load()
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
  if (!data) return <p className="text-sm text-gray-400 py-10 text-center">Grupo no encontrado.</p>

  return (
    <div className="space-y-5">
      <div>
        <Link href="/academic/groups" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Grupos
        </Link>
        <h2 className="text-lg font-bold text-gray-900">{data.group.name}</h2>
        <p className="text-sm text-gray-400">{data.group.semester_name}</p>
      </div>

      {/* Asignaturas */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-gray-400" />Asignaturas ({data.offerings.length})</h3>
          <div className="flex items-center gap-2">
            <select value={addingOff} onChange={e => addOffering(e.target.value)} className={inp}>
              <option value="">+ Agregar asignatura…</option>
              {data.available.map(o => <option key={o.id} value={o.id}>{o.course_name}{o.course_code ? ` (${o.course_code})` : ''}</option>)}
            </select>
          </div>
        </div>
        {data.offerings.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">Sin asignaturas. Agrégalas desde el selector (define las aulas del grupo).</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.offerings.map(o => (
              <div key={o.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-gray-800">{o.course_name}</p>
                  <p className="text-xs text-gray-400">{o.course_code ?? '—'}{o.teacher ? ` · ${o.teacher}` : ''}</p>
                </div>
                <button onClick={() => removeOffering(o.id)} className="text-gray-300 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Estudiantes */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Users className="w-4 h-4 text-gray-400" />Estudiantes ({data.students.length})</h3>
        <div className="relative">
          <div className="flex items-center border border-gray-200 rounded-lg px-3">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={q} onChange={e => searchStudents(e.target.value)} placeholder="Buscar estudiante para agregar…" className="flex-1 px-2 py-2 text-sm focus:outline-none" />
          </div>
          {hits.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
              {hits.map(h => (
                <button key={h.id} onClick={() => addStudent(h)} className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <Plus className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span><span className="text-sm text-gray-800">{h.name}</span> <span className="text-xs text-gray-400">{h.document_number ?? ''}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
        {data.students.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">Sin estudiantes asociados.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.students.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-gray-300" />
                  <div>
                    <p className="text-sm text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.document_number ?? '—'}</p>
                  </div>
                </div>
                <button onClick={() => removeStudent(s.id)} className="text-gray-300 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const inp = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs'
