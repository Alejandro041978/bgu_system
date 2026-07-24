'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Search, GraduationCap, Undo2 } from 'lucide-react'

interface Beca {
  id: string; enrollment_id: string
  student_name: string; document_number: string | null; program_name: string | null
  percentage: number; amount: number | null; list_price: number | null; transfer_savings: number
  granted_at: string; granted_by: string | null; note: string | null
  revoked_at: string | null
}
interface Hit { id: string; name: string; document: string | null }
interface Enr { id: string; program_name: string; list_price: number | null; transfer_savings: number; has_active: boolean }

const money = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function Scholarships() {
  const [becas, setBecas] = useState<Beca[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Asignación manual
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [student, setStudent] = useState<Hit | null>(null)
  const [enrollments, setEnrollments] = useState<Enr[]>([])
  const [enrId, setEnrId] = useState('')
  const [pct, setPct] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch('/api/collection/scholarships').then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setBecas(d.becas ?? []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (student || q.trim().length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      const d = await fetch(`/api/students/search?q=${encodeURIComponent(q.trim())}`).then(r => r.json()).catch(() => ({ students: [] }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setHits((d.students ?? []).slice(0, 8).map((s: any) => ({ id: s.id, name: s.name ?? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' '), document: s.document_number ?? s.document ?? null })))
    }, 300)
    return () => clearTimeout(t)
  }, [q, student])

  async function pickStudent(h: Hit) {
    setStudent(h); setHits([]); setQ(h.name); setEnrId('')
    const d = await fetch(`/api/collection/scholarships?student=${h.id}`).then(r => r.json())
    const enrs: Enr[] = d.enrollments ?? []
    setEnrollments(enrs)
    const libres = enrs.filter(e => !e.has_active)
    if (libres.length === 1) setEnrId(libres[0].id)
  }

  function resetForm() {
    setOpen(false); setStudent(null); setQ(''); setEnrollments([]); setEnrId(''); setPct(''); setNote('')
  }

  // Regla: el ahorro TC se resta PRIMERO; beca = (lista − ahorro) × %
  const selectedEnr = enrollments.find(e => e.id === enrId)
  const pctNum = Number(pct)
  const becaBase = selectedEnr?.list_price != null ? Math.max(0, selectedEnr.list_price - (selectedEnr.transfer_savings ?? 0)) : null
  const preview = becaBase != null && pctNum > 0 && pctNum <= 100
    ? Math.round(becaBase * pctNum) / 100 : null

  async function grant() {
    if (!student || !enrId || !(pctNum > 0 && pctNum <= 100)) return
    setSaving(true); setError(null)
    const d = await fetch('/api/collection/scholarships', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: student.id, enrollment_id: enrId, percentage: pctNum, note: note.trim() || null }),
    }).then(r => r.json())
    setSaving(false)
    if (d.error) { setError(d.error); return }
    resetForm(); load()
  }

  async function revoke(b: Beca) {
    if (!confirm(`¿Revocar la beca del ${b.percentage}% de ${b.student_name}? Quedará el rastro con fecha de revocación.`)) return
    const d = await fetch('/api/collection/scholarships', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id, action: 'revoke' }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load()
  }

  const activas = becas.filter(b => !b.revoked_at)
  const totalBecado = activas.reduce((s, b) => s + Number(b.amount ?? 0), 0)

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span>{error}</span><button onClick={() => setError(null)}>✕</button></div>}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">{activas.length} beca(s) activa(s) · monto becado total {money(totalBecado)}</p>
        {!open && <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4" />Asignar beca</button>}
      </div>

      {/* Formulario de otorgamiento */}
      {open && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Nueva beca</h3>
            <button onClick={resetForm} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
          </div>
          <div className="relative max-w-lg">
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-gray-400" />
              <input value={q} onChange={e => { setQ(e.target.value); setStudent(null) }} placeholder="Buscar estudiante (nombre, documento, correo)…"
                className="flex-1 text-sm focus:outline-none" />
            </div>
            {hits.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-56 overflow-auto">
                {hits.map(h => (
                  <button key={h.id} onClick={() => pickStudent(h)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">
                    {h.name} {h.document && <span className="text-gray-400 text-xs ml-1">{h.document}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {student && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <label className="block"><span className="block text-xs text-gray-500 mb-1">Programa (matrícula)</span>
                <select value={enrId} onChange={e => setEnrId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Seleccionar…</option>
                  {enrollments.map(e => (
                    <option key={e.id} value={e.id} disabled={e.has_active}>
                      {e.program_name}{e.list_price != null ? ` — lista ${money(e.list_price)}` : ''}{e.has_active ? ' (ya tiene beca activa)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block"><span className="block text-xs text-gray-500 mb-1">Porcentaje de beca (%)</span>
                <input value={pct} onChange={e => setPct(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="Ej. 25"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </label>
              <button onClick={grant} disabled={saving || !enrId || !(pctNum > 0 && pctNum <= 100)}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}Otorgar (hoy)
              </button>
              <label className="block sm:col-span-3"><span className="block text-xs text-gray-500 mb-1">Nota (convenio, resolución…)</span>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Opcional" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </label>
              {preview != null && (
                <p className="sm:col-span-3 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 tabular-nums">
                  Beca: {money(preview)} ({pctNum}% de {money(becaBase!)}{(selectedEnr!.transfer_savings ?? 0) > 0 ? ` = lista ${money(selectedEnr!.list_price!)} − ahorro TC ${money(selectedEnr!.transfer_savings)}` : ''}) →
                  Total Tuition {money(becaBase! - preview)}. La fecha de otorgamiento se registra automáticamente (hoy).
                </p>
              )}
              {selectedEnr && selectedEnr.list_price == null && (
                <p className="sm:col-span-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Esta matrícula no tiene precio de lista congelado (categoría sin tarifa publicada): la beca se registra con porcentaje pero sin monto.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lista de becas */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-4 py-2 text-left">Estudiante</th>
                <th className="px-4 py-2 text-left">Programa</th>
                <th className="px-4 py-2 text-right">%</th>
                <th className="px-4 py-2 text-right">Precio lista</th>
                <th className="px-4 py-2 text-right">Ahorro TC</th>
                <th className="px-4 py-2 text-right">Monto beca</th>
                <th className="px-4 py-2 text-right">Total Tuition</th>
                <th className="px-4 py-2 text-left">Otorgada</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {becas.map(b => (
                <tr key={b.id} className={b.revoked_at ? 'opacity-50' : 'hover:bg-gray-50/50'}>
                  <td className="px-4 py-2">
                    <span className="text-gray-800">{b.student_name}</span>
                    <span className="block text-[11px] text-gray-400">{b.document_number}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">{b.program_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-violet-700">{b.percentage}%</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500">{b.list_price != null ? money(b.list_price) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-teal-700">{b.transfer_savings > 0 ? money(b.transfer_savings) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-violet-700">{b.amount != null ? money(b.amount) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{b.list_price != null && b.amount != null ? money(Math.max(0, b.list_price - b.transfer_savings - b.amount)) : '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {b.granted_at}{b.revoked_at && <span className="block text-red-500">revocada {String(b.revoked_at).slice(0, 10)}</span>}
                    {b.note && <span className="block text-gray-400 max-w-48 truncate" title={b.note}>{b.note}</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!b.revoked_at && (
                      <button onClick={() => revoke(b)} title="Revocar" className="text-gray-300 hover:text-red-600"><Undo2 className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && becas.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-gray-400">Aún no hay becas otorgadas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
