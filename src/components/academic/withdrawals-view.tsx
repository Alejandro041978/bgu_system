'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Plus, Search, X, Undo2, Trash2 } from 'lucide-react'

type Row = {
  id: string; student_id: string; type: 'IW' | 'LOA'; resolution_number: string | null
  withdrawal_date: string; expires_at: string | null; status: string; reason: string | null; note: string | null
  source: string; student_name: string; document_number: string | null
}
type Student = { id: string; name: string; document_number: string | null; email: string | null }

const TYPE: Record<string, { label: string; cls: string }> = {
  IW:  { label: 'IW · Definitivo', cls: 'bg-rose-50 text-rose-700' },
  LOA: { label: 'LOA · Temporal',  cls: 'bg-orange-50 text-orange-700' },
}
const STATUS: Record<string, { label: string; cls: string }> = {
  vigente:       { label: 'Vigente',        cls: 'bg-gray-100 text-gray-700' },
  reincorporado: { label: 'Reincorporado',  cls: 'bg-green-50 text-green-700' },
  convertido_iw: { label: 'Convertido a IW', cls: 'bg-rose-50 text-rose-700' },
}
const fdate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// El nivel/categoría va codificado en el número de resolución
// (…-IW-BACHELOR, …-IW-DCE). Se lee de ahí para filtrar sin tocar la API.
const LEVELS: { key: string; label: string; token: string }[] = [
  { key: 'BACHELOR',  label: 'Bachelor',  token: 'BACHELOR' },
  { key: 'MASTER',    label: 'Master',    token: 'MASTER' },
  { key: 'DOCTORATE', label: 'Doctorado', token: 'DOCTORATE' },
  { key: 'DCE',       label: 'DCE',       token: 'DCE' },
]
function levelOf(resolution: string | null): string | null {
  const m = (resolution ?? '').toUpperCase().match(/-(?:IW|LOA)-([A-Z]+)/)
  return m ? m[1] : null
}

export function WithdrawalsView() {
  const [rows, setRows] = useState<Row[]>([])
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [level, setLevel] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (type) qs.set('type', type)
    if (status) qs.set('status', status)
    const d = await fetch(`/api/academic/withdrawals${qs.toString() ? `?${qs}` : ''}`).then(r => r.json())
    setRows(d.rows ?? []); setLoading(false)
  }, [type, status])
  useEffect(() => { load() }, [load])

  // --- Formulario de registro ---
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Student[]>([])
  const [student, setStudent] = useState<Student | null>(null)
  const [form, setForm] = useState({ type: 'LOA' as 'IW' | 'LOA', withdrawal_date: new Date().toISOString().slice(0, 10), resolution_number: '', reason: '', note: '' })
  const [numberHint, setNumberHint] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) return
    const t = setTimeout(async () => {
      const d = await fetch(`/api/students/search?q=${encodeURIComponent(q)}`).then(r => r.json())
      setResults(d.students ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  function onSearchChange(value: string) {
    setQ(value)
    if (value.trim().length < 2) setResults([])
  }

  function clearStudent() {
    setStudent(null); setQ(''); setResults([]); setNumberHint(null)
    setForm(f => ({ ...f, resolution_number: '' }))
  }

  // Al elegir estudiante / cambiar tipo o fecha, proponer el consecutivo
  useEffect(() => {
    if (!student) return
    let cancelled = false
    ;(async () => {
      const d = await fetch(`/api/academic/withdrawals/next-number?student_id=${student.id}&type=${form.type}&date=${form.withdrawal_date}`).then(r => r.json())
      if (cancelled) return
      setForm(f => ({ ...f, resolution_number: d.resolution_number ?? '' }))
      setNumberHint(d.warning ?? null)
    })()
    return () => { cancelled = true }
  }, [student, form.type, form.withdrawal_date])

  function resetForm() {
    setShowForm(false); setStudent(null); setQ(''); setResults([]); setNumberHint(null)
    setForm({ type: 'LOA', withdrawal_date: new Date().toISOString().slice(0, 10), resolution_number: '', reason: '', note: '' })
  }

  async function save() {
    if (!student) return
    setSaving(true)
    const res = await fetch('/api/academic/withdrawals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: student.id, ...form }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { alert(d.error ?? 'No se pudo registrar'); return }
    resetForm(); load()
  }

  async function reincorporar(r: Row) {
    if (!confirm(`¿Reincorporar a ${r.student_name}? El LOA se cierra y el estudiante vuelve a activo.`)) return
    await fetch(`/api/academic/withdrawals/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'reincorporado' }),
    })
    load()
  }

  async function anular(r: Row) {
    if (!confirm(`¿Anular este registro de retiro de ${r.student_name}? Se elimina del historial.`)) return
    await fetch(`/api/academic/withdrawals/${r.id}`, { method: 'DELETE' })
    load()
  }

  // El filtro de nivel se aplica en cliente sobre lo que ya trajo la API
  // (filtrado por tipo/estado). Los conteos por nivel salen de ese mismo conjunto.
  const levelCounts: Record<string, number> = {}
  for (const r of rows) { const l = levelOf(r.resolution_number); if (l) levelCounts[l] = (levelCounts[l] ?? 0) + 1 }
  const visible = level ? rows.filter(r => levelOf(r.resolution_number) === level) : rows

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-2">
          {[['', 'Todos'], ['IW', 'IW · Definitivos'], ['LOA', 'LOA · Temporales']].map(([k, l]) => (
            <button key={k} onClick={() => setType(k)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${type === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
          ))}
          <span className="w-px bg-gray-200 mx-1" />
          {[['', 'Todo estado'], ['vigente', 'Vigentes'], ['reincorporado', 'Reincorporados']].map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${status === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4" /> Registrar retiro
        </button>
      </div>

      {/* Filtro por nivel/categoría + total */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide mr-1">Nivel:</span>
          <button onClick={() => setLevel('')} className={`px-3 py-1 rounded-lg text-xs font-medium border ${level === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Todos</button>
          {LEVELS.map(lv => (
            <button key={lv.key} onClick={() => setLevel(lv.key)} className={`px-3 py-1 rounded-lg text-xs font-medium border ${level === lv.key ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {lv.label} <span className="opacity-70">({levelCounts[lv.token] ?? 0})</span>
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500">
          {level ? <><b className="text-gray-800">{visible.length}</b> de {rows.length}</> : <><b className="text-gray-800">{rows.length}</b> retiros</>}
        </span>
      </div>

      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-blue-800">Registrar retiro</p>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          {/* Estudiante */}
          {student ? (
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm text-gray-800">{student.name}</p>
                <p className="text-[11px] text-gray-400">{student.document_number ?? student.email}</p>
              </div>
              <button onClick={clearStudent} className="text-xs text-blue-600 hover:underline">Cambiar</button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={q} onChange={e => onSearchChange(e.target.value)} placeholder="Buscar estudiante por nombre, documento o correo…"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                  {results.map(s => (
                    <button key={s.id} onClick={() => { setStudent(s); setResults([]) }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <p className="text-sm text-gray-800">{s.name}</p>
                      <p className="text-[11px] text-gray-400">{s.document_number ?? s.email}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'IW' | 'LOA' }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="LOA">LOA · Retiro temporal (1 semestre)</option>
                <option value="IW">IW · Retiro definitivo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha *</label>
              <input type="date" value={form.withdrawal_date} onChange={e => setForm(f => ({ ...f, withdrawal_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">N° de resolución</label>
              <input value={form.resolution_number} onChange={e => setForm(f => ({ ...f, resolution_number: e.target.value }))}
                placeholder={student ? 'Generando…' : 'Elige un estudiante'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {numberHint && <p className="text-[11px] text-amber-600">{numberHint}</p>}
          {form.type === 'LOA' && <p className="text-[11px] text-gray-500">El LOA vence a los 6 meses. Si no hay reincorporación, se convierte en IW automáticamente.</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Motivo</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Motivo declarado por el estudiante"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nota interna</label>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Resultado de la llamada, observaciones…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={!student || saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium rounded-lg">
              {saving ? 'Guardando…' : 'Registrar retiro'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-white">Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">Sin retiros registrados con este filtro.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-2.5">Estudiante</th>
                <th className="text-left px-4 py-2.5">Tipo</th>
                <th className="text-left px-4 py-2.5">N° resolución</th>
                <th className="text-left px-4 py-2.5">Fecha</th>
                <th className="text-left px-4 py-2.5">Vence (LOA)</th>
                <th className="text-left px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.map(r => (
                <tr key={r.id} className="group hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <p className="text-gray-800">{r.student_name || 'Estudiante'}</p>
                    <p className="text-[11px] text-gray-400">{r.document_number}{r.reason ? ` · ${r.reason}` : ''}</p>
                  </td>
                  <td className="px-4 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE[r.type]?.cls}`}>{TYPE[r.type]?.label ?? r.type}</span></td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-600">{r.resolution_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{fdate(r.withdrawal_date)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{r.type === 'LOA' ? fdate(r.expires_at) : '—'}</td>
                  <td className="px-4 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-500'}`}>{STATUS[r.status]?.label ?? r.status}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {r.type === 'LOA' && r.status === 'vigente' && (
                        <button onClick={() => reincorporar(r)} title="Reincorporar"
                          className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"><Undo2 className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={() => anular(r)} title="Anular registro"
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
