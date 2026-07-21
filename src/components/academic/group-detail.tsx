'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, X, Search, Loader2, BookOpen, Users, UserCheck, RefreshCw } from 'lucide-react'

interface SyncResult { configured: boolean; students_total: number; with_account: number; no_account: number; accounts_created?: number; enrol_ops: number; courses_unmapped: string[]; errors: string[] }

interface Off {
  id: string; course_name: string; course_code: string | null; teacher: string | null
  start_date: string | null; end_date: string | null; moodle_course_id: string | null
}
interface Stu { id: string; name: string; document_number: string | null }
interface Sequence { next_group_id: string | null; is_entry: boolean; prev_label: string | null; siblings: { id: string; label: string }[] }
interface Data { group: { id: string; abbreviation: string | null; name: string | null; detail: string | null; program_name: string }; sequence: Sequence; offerings: Off[]; students: Stu[] }

const fdate = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '—')

export function GroupDetail({ groupId }: { groupId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Stu[]>([])
  const [savingMoodle, setSavingMoodle] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [sync, setSync] = useState<SyncResult | null>(null)
  const [savingSeq, setSavingSeq] = useState(false)
  const [seqErr, setSeqErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch(`/api/academic/groups/${groupId}`).then(r => r.json())
    setData(d.error ? null : d); setLoading(false)
  }, [groupId])
  useEffect(() => { load() }, [load])

  function setMoodle(offId: string, value: string) {
    setData(d => d ? { ...d, offerings: d.offerings.map(o => o.id === offId ? { ...o, moodle_course_id: value } : o) } : d)
  }
  async function saveMoodle(off: Off) {
    setSavingMoodle(off.id)
    await fetch(`/api/academic/offerings/${off.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moodle_course_id: off.moodle_course_id ?? '' }),
    })
    setSavingMoodle(null)
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

  async function doSync() {
    setSyncing(true); setSync(null)
    const r = await fetch(`/api/academic/groups/${groupId}/moodle-sync`, { method: 'POST' }).then(res => res.json())
    setSyncing(false); setSync(r); load()
  }

  async function saveNextGroup(value: string) {
    setSavingSeq(true); setSeqErr(null)
    const r = await fetch('/api/academic/groups', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: groupId, next_group_id: value || null }),
    }).then(res => res.json())
    setSavingSeq(false)
    if (r.error) { setSeqErr(r.error); return }
    load()
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
  if (!data) return <p className="text-sm text-gray-400 py-10 text-center">Grupo no encontrado.</p>

  return (
    <div className="space-y-5">
      <div>
        <Link href="/academic/groups" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Grupos
        </Link>
        <h2 className="text-lg font-bold text-gray-900">
          {data.group.abbreviation && <span className="text-blue-600">{data.group.abbreviation}</span>}
          {data.group.abbreviation && data.group.name ? ' · ' : ''}{data.group.name}
        </h2>
        <p className="text-sm text-gray-400">{data.group.program_name}{data.group.detail ? ` · ${data.group.detail}` : ''}</p>
      </div>

      {/* Secuencia de carruseles */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Secuencia (carrusel)</h3>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {data.sequence.is_entry
            ? <span className="text-xs font-medium bg-green-50 text-green-700 px-2 py-1 rounded-full">Carrusel de entrada</span>
            : <span className="text-xs text-gray-500">Viene de: <b className="text-gray-700">{data.sequence.prev_label}</b></span>}
          <span className="text-gray-300">→</span>
          <label className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Al aprobar todo, avanza a</span>
            <select
              value={data.sequence.next_group_id ?? ''}
              onChange={e => saveNextGroup(e.target.value)}
              disabled={savingSeq}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— (último: al completarlo egresa)</option>
              {data.sequence.siblings.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            {savingSeq && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          </label>
        </div>
        {seqErr && <p className="text-xs text-red-600">{seqErr}</p>}
        <p className="text-[11px] text-gray-400">El estudiante avanza al siguiente carrusel cuando aprueba todas las asignaturas de este; se desconecta de estas aulas y se matricula en las del siguiente.</p>
      </div>

      {/* Asignaturas (solo lectura; se asignan en Oferta Académica) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-gray-400" />Asignaturas ({data.offerings.length})</h3>
          <span className="text-xs text-gray-400">Se asignan en <Link href="/academic/offer" className="text-blue-600 hover:underline">Oferta Académica</Link></span>
        </div>
        {data.offerings.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">Sin asignaturas. Asígnalas a este grupo desde Oferta Académica.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                  <th className="text-left px-3 py-2">Asignatura</th>
                  <th className="text-left px-3 py-2">Fechas de clases</th>
                  <th className="text-left px-3 py-2 w-48">ID curso Moodle</th>
                </tr>
              </thead>
              <tbody>
                {data.offerings.map(o => (
                  <tr key={o.id} className="border-t border-gray-50">
                    <td className="px-3 py-2">
                      <p className="text-gray-800">{o.course_name}</p>
                      <p className="text-xs text-gray-400">{o.course_code ?? '—'}{o.teacher ? ` · ${o.teacher}` : ''}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{fdate(o.start_date)} — {fdate(o.end_date)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input value={o.moodle_course_id ?? ''} onChange={e => setMoodle(o.id, e.target.value)} onBlur={() => saveMoodle(o)}
                          placeholder="ID del aula" className="w-32 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        {savingMoodle === o.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Estudiantes */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Users className="w-4 h-4 text-gray-400" />Estudiantes ({data.students.length})</h3>
          <button onClick={doSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sincronizar con Moodle
          </button>
        </div>
        {sync && (
          <div className={`text-xs rounded-lg px-3 py-2 ${sync.errors?.length || !sync.configured ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-700'}`}>
            {!sync.configured ? 'Moodle no está configurado (faltan variables en Vercel).' : (
              <>
                <b>{sync.enrol_ops}</b> matrículas · <b>{sync.with_account}</b> con cuenta · <b>{sync.no_account}</b> sin cuenta Moodle
                {(sync.accounts_created ?? 0) > 0 && <> · <b>{sync.accounts_created}</b> cuentas Moodle creadas</>}
                {sync.courses_unmapped?.length > 0 && <div className="mt-0.5">⚠ Asignaturas sin aula: {sync.courses_unmapped.join(', ')}</div>}
                {sync.errors?.length > 0 && <div className="mt-0.5">Errores: {sync.errors.slice(0, 3).join(' · ')}</div>}
              </>
            )}
          </div>
        )}
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
