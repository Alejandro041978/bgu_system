'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Search, Gift, Trash2, Pencil, Check, X } from 'lucide-react'

interface Bono {
  id: string; enrollment_id: string
  student_name: string; document_number: string | null; program_name: string | null
  percentage: number; scholarship_pct: number
  base_after_beca: number | null; amount: number | null; total_tuition: number | null
  reason: string | null; granted_at: string; granted_by: string | null
}
interface Hit { id: string; name: string; document: string | null }
interface Enr { id: string; program_name: string; list_price: number | null; transfer_savings: number; scholarship_pct: number; after_beca: number | null; has_active: boolean }

const money = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function Bonuses() {
  const [bonos, setBonos] = useState<Bono[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Alta
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [student, setStudent] = useState<Hit | null>(null)
  const [enrollments, setEnrollments] = useState<Enr[]>([])
  const [enrId, setEnrId] = useState('')
  const [pct, setPct] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Edición inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editPct, setEditPct] = useState('')
  const [editReason, setEditReason] = useState('')

  const load = useCallback(async () => {
    const d = await fetch('/api/collection/bonuses').then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setBonos(d.bonos ?? []); setLoading(false)
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
    const d = await fetch(`/api/collection/bonuses?student=${h.id}`).then(r => r.json())
    const enrs: Enr[] = d.enrollments ?? []
    setEnrollments(enrs)
    const libres = enrs.filter(e => !e.has_active)
    if (libres.length === 1) setEnrId(libres[0].id)
  }

  function resetForm() {
    setOpen(false); setStudent(null); setQ(''); setEnrollments([]); setEnrId(''); setPct(''); setReason('')
  }

  // El bono se aplica sobre lo que queda DESPUÉS de la beca (after_beca).
  const selectedEnr = enrollments.find(e => e.id === enrId)
  const pctNum = Number(pct)
  const preview = selectedEnr?.after_beca != null && pctNum > 0 && pctNum <= 100
    ? Math.round(selectedEnr.after_beca * pctNum) / 100 : null

  async function grant() {
    if (!student || !enrId || !(pctNum > 0 && pctNum <= 100) || !reason.trim()) return
    setSaving(true); setError(null)
    const d = await fetch('/api/collection/bonuses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: student.id, enrollment_id: enrId, percentage: pctNum, reason: reason.trim() }),
    }).then(r => r.json())
    setSaving(false)
    if (d.error) { setError(d.error); return }
    resetForm(); load()
  }

  function startEdit(b: Bono) {
    setEditId(b.id); setEditPct(String(b.percentage)); setEditReason(b.reason ?? '')
  }
  async function saveEdit(id: string) {
    const p = Number(editPct)
    if (!(p > 0 && p <= 100) || !editReason.trim()) { setError('Porcentaje (0-100) y motivo son obligatorios'); return }
    const d = await fetch('/api/collection/bonuses', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, percentage: p, reason: editReason.trim() }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    setEditId(null); load()
  }
  async function remove(b: Bono) {
    if (!confirm(`¿Eliminar el bono del ${b.percentage}% de ${b.student_name}? Esta acción no se puede deshacer.`)) return
    const d = await fetch(`/api/collection/bonuses?id=${b.id}`, { method: 'DELETE' }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    load()
  }

  const totalBono = bonos.reduce((s, b) => s + Number(b.amount ?? 0), 0)

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between"><span>{error}</span><button onClick={() => setError(null)}>✕</button></div>}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">{bonos.length} bono(s) · monto en bonos {money(totalBono)}</p>
        {!open && <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4" />Nuevo bono</button>}
      </div>

      {/* Formulario de alta */}
      {open && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Nuevo bono</h3>
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
                      {e.program_name}{e.after_beca != null ? ` — tras beca ${money(e.after_beca)}` : ''}{e.has_active ? ' (ya tiene bono)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block"><span className="block text-xs text-gray-500 mb-1">Porcentaje del bono (%)</span>
                <input value={pct} onChange={e => setPct(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="Ej. 10"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </label>
              <button onClick={grant} disabled={saving || !enrId || !(pctNum > 0 && pctNum <= 100) || !reason.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}Otorgar (hoy)
              </button>
              <label className="block sm:col-span-3"><span className="block text-xs text-gray-500 mb-1">Motivo del bono <span className="text-red-500">*</span></span>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej. referido, pago puntual, convenio especial…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </label>
              {preview != null && selectedEnr && (
                <p className="sm:col-span-3 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 tabular-nums">
                  Bono: {money(preview)} ({pctNum}% de {money(selectedEnr.after_beca!)} = lo que resta tras la beca{selectedEnr.scholarship_pct > 0 ? ` del ${selectedEnr.scholarship_pct}%` : ''}) →
                  Total Tuition {money(Math.max(0, selectedEnr.after_beca! - preview))}. La fecha se registra automáticamente (hoy).
                </p>
              )}
              {selectedEnr && selectedEnr.list_price == null && (
                <p className="sm:col-span-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Esta matrícula no tiene precio de lista congelado (categoría sin tarifa): el bono se registra con porcentaje pero sin monto.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lista de bonos */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-4 py-2 text-left">Estudiante</th>
                <th className="px-4 py-2 text-left">Programa</th>
                <th className="px-4 py-2 text-right">% bono</th>
                <th className="px-4 py-2 text-right">Base (tras beca)</th>
                <th className="px-4 py-2 text-right">Monto bono</th>
                <th className="px-4 py-2 text-right">Total Tuition</th>
                <th className="px-4 py-2 text-left">Motivo</th>
                <th className="px-4 py-2 text-left">Otorgado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bonos.map(b => {
                const editing = editId === b.id
                return (
                  <tr key={b.id} className="hover:bg-gray-50/50 align-top">
                    <td className="px-4 py-2">
                      <span className="text-gray-800">{b.student_name}</span>
                      <span className="block text-[11px] text-gray-400">{b.document_number}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">{b.program_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-700">
                      {editing
                        ? <input value={editPct} onChange={e => setEditPct(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-right text-xs" />
                        : `${b.percentage}%`}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{b.base_after_beca != null ? money(b.base_after_beca) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{b.amount != null ? money(b.amount) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.total_tuition != null ? money(b.total_tuition) : '—'}</td>
                    <td className="px-4 py-2 text-xs text-gray-600 max-w-48">
                      {editing
                        ? <input value={editReason} onChange={e => setEditReason(e.target.value)} className="w-40 border border-gray-200 rounded px-1.5 py-0.5 text-xs" />
                        : <span className="truncate block" title={b.reason ?? ''}>{b.reason ?? '—'}</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{b.granted_at}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {editing ? (
                        <span className="inline-flex items-center gap-1.5">
                          <button onClick={() => saveEdit(b.id)} title="Guardar" className="text-green-500 hover:text-green-700"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditId(null)} title="Cancelar" className="text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <button onClick={() => startEdit(b)} title="Editar" className="text-gray-300 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => remove(b)} title="Eliminar" className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!loading && bonos.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-gray-400">Aún no hay bonos otorgados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
