'use client'

import { useState, useEffect } from 'react'
import { Loader2, Plus, Trash2, Search, X, Layers, Users, Check } from 'lucide-react'

interface Course { id: string; name: string; code: string | null }
interface Program { id: string; name: string; code: string | null; courses: Course[] }
interface Scale { id: string; name: string }
interface SchemeItem { id: string; origin_course_name: string; origin_course_code: string | null; origin_credits: number | null; dest_course_id: string | null; dest_course_name: string | null }
interface Scheme {
  id: string; name: string; origin_institution: string; dest_program_id: string | null; scale_id: string | null
  items?: { id: string }[]
}
interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }

export function TransferSchemesView({ programs, scales }: { programs: Program[]; scales: Scale[] }) {
  const [schemes, setSchemes] = useState<Scheme[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ scheme: Scheme; items: SchemeItem[]; applied_count: number } | null>(null)
  const [creating, setCreating] = useState(false)

  async function loadList() {
    const d = await fetch('/api/academic/transfer-schemes').then(r => r.json())
    setSchemes(d.schemes ?? [])
  }
  useEffect(() => {
    fetch('/api/academic/transfer-schemes').then(r => r.json()).then(d => setSchemes(d.schemes ?? [])).catch(() => {})
  }, [])

  async function openScheme(id: string) {
    setCreating(false); setSelId(id)
    const d = await fetch(`/api/academic/transfer-schemes/${id}`).then(r => r.json())
    setDetail(d.scheme ? d : null)
  }
  async function delScheme(id: string) {
    if (!confirm('¿Eliminar este esquema? (Las convalidaciones ya generadas se mantienen.)')) return
    await fetch(`/api/academic/transfer-schemes/${id}`, { method: 'DELETE' })
    if (selId === id) { setSelId(null); setDetail(null) }
    await loadList()
  }

  const program = detail ? programs.find(p => p.id === detail.scheme.dest_program_id) : undefined
  const scale = detail ? scales.find(s => s.id === detail.scheme.scale_id) : undefined

  return (
    <div className="flex gap-4">
      <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden self-start">
        <div className="p-3 border-b border-gray-100">
          <button onClick={() => { setCreating(true); setSelId(null); setDetail(null) }}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Nuevo esquema
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto divide-y divide-gray-50">
          {schemes.length === 0 ? (
            <p className="py-10 text-center text-xs text-gray-400">Sin esquemas</p>
          ) : schemes.map(s => (
            <button key={s.id} onClick={() => openScheme(s.id)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selId === s.id ? 'bg-blue-50' : ''}`}>
              <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
              <p className="text-xs text-gray-400 truncate">{s.origin_institution}</p>
              <span className="text-[10px] text-gray-400">{s.items?.length ?? 0} asignatura(s)</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {creating ? (
          <NewSchemeForm programs={programs} scales={scales} onCancel={() => setCreating(false)}
            onCreated={async (id) => { await loadList(); await openScheme(id) }} />
        ) : detail ? (
          <SchemeDetail key={detail.scheme.id} detail={detail} program={program} scale={scale}
            onReload={() => { openScheme(detail.scheme.id); loadList() }} onDelete={() => delScheme(detail.scheme.id)} />
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-20 text-center text-gray-400">
            <Layers className="w-10 h-10 mx-auto mb-3" />
            <p className="text-sm">Selecciona un esquema o crea uno nuevo</p>
          </div>
        )}
      </div>
    </div>
  )
}

function NewSchemeForm({ programs, scales, onCancel, onCreated }: {
  programs: Program[]; scales: Scale[]; onCancel: () => void; onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [originInst, setOriginInst] = useState('')
  const [destProg, setDestProg] = useState('')
  const [scaleId, setScaleId] = useState('')
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!name || !originInst || !destProg || !scaleId) return
    setSaving(true)
    const res = await fetch('/api/academic/transfer-schemes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, origin_institution: originInst, dest_program_id: destProg, scale_id: scaleId }),
    })
    setSaving(false)
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error ?? 'Error'); return }
    const d = await res.json()
    onCreated(d.id)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Nuevo esquema masivo</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del esquema</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Convenio X · Bachelor en …"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Institución de origen</label>
          <input value={originInst} onChange={e => setOriginInst(e.target.value)} placeholder="Universidad …"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Programa de destino</label>
          <select value={destProg} onChange={e => setDestProg(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Elegir…</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Escala de conversión (origen)</label>
          <select value={scaleId} onChange={e => setScaleId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Elegir…</option>
            {scales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-sm text-gray-500 px-3 py-2">Cancelar</button>
        <button onClick={create} disabled={saving || !name || !originInst || !destProg || !scaleId}
          className="flex items-center gap-1.5 text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Crear esquema
        </button>
      </div>
    </div>
  )
}

function SchemeDetail({ detail, program, scale, onReload, onDelete }: {
  detail: { scheme: Scheme; items: SchemeItem[]; applied_count: number }; program?: Program; scale?: Scale
  onReload: () => void; onDelete: () => void
}) {
  const { scheme, items, applied_count } = detail
  const courses = program?.courses ?? []
  const [originCode, setOriginCode] = useState('')
  const [originName, setOriginName] = useState('')
  const [originCredits, setOriginCredits] = useState('')
  const [destCourse, setDestCourse] = useState('')
  const [adding, setAdding] = useState(false)

  // aplicar a estudiantes
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [picked, setPicked] = useState<StudentHit[]>([])
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function addItem() {
    if (!originName) return
    setAdding(true)
    const c = courses.find(x => x.id === destCourse)
    await fetch(`/api/academic/transfer-schemes/${scheme.id}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin_course_name: originName, origin_course_code: originCode || null,
        origin_credits: originCredits === '' ? null : Number(originCredits),
        dest_course_id: destCourse || null, dest_course_name: c?.name ?? null,
      }),
    })
    setAdding(false); setOriginCode(''); setOriginName(''); setOriginCredits(''); setDestCourse('')
    onReload()
  }
  async function delItem(itemId: string) {
    await fetch(`/api/academic/transfer-scheme-items/${itemId}`, { method: 'DELETE' })
    onReload()
  }
  async function search(value: string) {
    setQ(value)
    if (value.trim().length < 2) { setHits([]); return }
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(value.trim())}`).then(r => r.json())
    setHits(d.students ?? [])
  }
  function pick(h: StudentHit) {
    if (!picked.some(p => p.id === h.id)) setPicked([...picked, h])
    setQ(''); setHits([])
  }
  async function apply() {
    if (picked.length === 0 || items.length === 0) return
    setApplying(true); setResult(null)
    const res = await fetch(`/api/academic/transfer-schemes/${scheme.id}/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_ids: picked.map(p => p.id) }),
    })
    setApplying(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { alert(d.error ?? 'Error'); return }
    setResult(`Aplicado a ${d.applied} estudiante(s)${d.skipped ? ` · ${d.skipped} ya tenían este esquema` : ''}.`)
    setPicked([])
    onReload()
  }

  return (
    <div className="space-y-4">
      {/* Cabecera + ítems */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{scheme.name}</h2>
            <div className="flex items-center gap-2 mt-2 text-sm flex-wrap">
              <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{scheme.origin_institution}</span>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">{program?.name ?? '—'}</span>
              <span className="px-2 py-0.5 bg-gray-50 text-gray-500 rounded-full text-xs">Escala: {scale?.name ?? '—'}</span>
              <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs">{applied_count} aplicado(s)</span>
            </div>
          </div>
          <button onClick={onDelete} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>

        <h3 className="text-xs font-semibold text-gray-600 mb-2">Asignaturas del esquema (origen → destino)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-2 w-16">N° origen</th>
              <th className="py-2 pr-3">Asignatura de origen</th>
              <th className="py-2 pr-2 w-14">Cr.</th>
              <th className="py-2 pr-3">Asignatura de destino</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(it => (
              <tr key={it.id}>
                <td className="py-2 pr-2 text-gray-500">{it.origin_course_code ?? '—'}</td>
                <td className="py-2 pr-3 text-gray-800">{it.origin_course_name}</td>
                <td className="py-2 pr-2 text-gray-500">{it.origin_credits ?? '—'}</td>
                <td className="py-2 pr-3 text-gray-600">{it.dest_course_name ?? '—'}</td>
                <td className="py-2 text-right"><button onClick={() => delItem(it.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
            <tr className="bg-gray-50/50">
              <td className="py-2 pr-2"><input value={originCode} onChange={e => setOriginCode(e.target.value)} placeholder="101" className="w-14 border border-gray-200 rounded px-2 py-1 text-sm" /></td>
              <td className="py-2 pr-2"><input value={originName} onChange={e => setOriginName(e.target.value)} placeholder="Denominación origen" className="w-full border border-gray-200 rounded px-2 py-1 text-sm" /></td>
              <td className="py-2 pr-2"><input type="number" value={originCredits} onChange={e => setOriginCredits(e.target.value)} placeholder="03" className="w-12 border border-gray-200 rounded px-2 py-1 text-sm" /></td>
              <td className="py-2 pr-2">
                <select value={destCourse} onChange={e => setDestCourse(e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white">
                  <option value="">Elegir asignatura…</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </td>
              <td className="py-2 text-right">
                <button onClick={addItem} disabled={adding || !originName} className="inline-flex items-center gap-1 text-xs font-medium bg-blue-600 text-white px-2 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Aplicar a estudiantes */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2"><Users className="w-4 h-4 text-gray-400" /> Aplicar a estudiantes</h3>
        <p className="text-xs text-gray-500 mb-3">Genera una convalidación por estudiante con estas asignaturas (sin nota). Las notas se completan luego, una por una, desde <strong>Convalidaciones</strong>.</p>

        <div className="relative mb-3">
          <div className="flex items-center border border-gray-200 rounded-lg px-3">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={q} onChange={e => search(e.target.value)} placeholder="Buscar estudiante por nombre, documento o correo…" className="flex-1 px-2 py-2 text-sm focus:outline-none" />
          </div>
          {hits.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
              {hits.map(h => (
                <button key={h.id} onClick={() => pick(h)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <p className="text-sm text-gray-800">{h.name}</p>
                  <p className="text-xs text-gray-400">{h.document_number ?? h.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {picked.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {picked.map(p => (
              <span key={p.id} className="inline-flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                {p.name}
                <button onClick={() => setPicked(picked.filter(x => x.id !== p.id))} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={apply} disabled={applying || picked.length === 0 || items.length === 0}
            className="flex items-center gap-1.5 text-sm font-medium bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Aplicar a {picked.length} estudiante(s)
          </button>
          {items.length === 0 && <span className="text-xs text-amber-600">Agrega asignaturas al esquema primero.</span>}
          {result && <span className="text-xs text-green-700">{result}</span>}
        </div>
      </div>
    </div>
  )
}
