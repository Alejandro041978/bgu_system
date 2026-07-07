'use client'

import { useState, useEffect } from 'react'
import { Loader2, Plus, Trash2, Search, ArrowRight, FileCheck, AlertTriangle, X, Download } from 'lucide-react'
import { convertGrade } from '@/lib/grade-convert'

interface Course { id: string; name: string; code: string | null; credits: number | null }
interface Program { id: string; name: string; code: string | null; category_id: string | null; courses: Course[] }
interface Scale { id: string; name: string; origin_min: number; origin_max: number; origin_passing: number }
interface Category { id: string; name: string; passing_score: number | null }
interface TItem { id: string; origin_course_name: string; origin_course_code: string | null; origin_credits: number | null; dest_course_id: string | null; dest_course_name: string | null; origin_grade: number | null; converted_grade: number | null }
interface Transfer {
  id: string; student_id: string; student_name: string | null; student_document: string | null
  origin_institution: string; origin_program: string | null; dest_program_id: string | null; scale_id: string | null
  created_at: string; items?: { id: string }[]
}
interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }

export function TransferCreditsView({ programs, scales, categories }: { programs: Program[]; scales: Scale[]; categories: Category[] }) {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ transfer: Transfer; items: TItem[] } | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  async function loadList() {
    const d = await fetch('/api/academic/transfer-credits').then(r => r.json())
    setTransfers(d.transfers ?? [])
  }
  useEffect(() => {
    fetch('/api/academic/transfer-credits').then(r => r.json()).then(d => setTransfers(d.transfers ?? [])).catch(() => {})
  }, [])

  async function openTransfer(id: string) {
    setCreating(false); setSelId(id)
    const d = await fetch(`/api/academic/transfer-credits/${id}`).then(r => r.json())
    setDetail(d.transfer ? d : null)
  }
  async function delTransfer(id: string) {
    if (!confirm('¿Eliminar esta convalidación y todas sus asignaturas?')) return
    await fetch(`/api/academic/transfer-credits/${id}`, { method: 'DELETE' })
    if (selId === id) { setSelId(null); setDetail(null) }
    await loadList()
  }

  const program = detail ? programs.find(p => p.id === detail.transfer.dest_program_id) : undefined
  const scale = detail ? scales.find(s => s.id === detail.transfer.scale_id) : undefined
  const destPassing = program ? (categories.find(c => c.id === program.category_id)?.passing_score ?? null) : null

  return (
    <div className="flex gap-4">
      {/* Lista */}
      <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden self-start">
        <div className="p-3 border-b border-gray-100 space-y-2">
          <button onClick={() => { setCreating(true); setSelId(null); setDetail(null) }}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Nueva convalidación
          </button>
          <div className="flex items-center border border-gray-200 rounded-lg px-2.5">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o documento…"
              className="flex-1 px-2 py-1.5 text-xs focus:outline-none" />
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto divide-y divide-gray-50">
          {(() => {
            const q = search.trim().toLowerCase()
            const list = q
              ? transfers.filter(t => (t.student_name ?? '').toLowerCase().includes(q) || (t.student_document ?? '').toLowerCase().includes(q))
              : transfers
            return list.length === 0 ? (
              <p className="py-10 text-center text-xs text-gray-400">{transfers.length === 0 ? 'Sin convalidaciones' : 'Sin resultados'}</p>
            ) : list.map(t => (
            <button key={t.id} onClick={() => openTransfer(t.id)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selId === t.id ? 'bg-blue-50' : ''}`}>
              <p className="text-sm font-medium text-gray-800 truncate">{t.student_name ?? 'Estudiante'}</p>
              <p className="text-xs text-gray-400 truncate">{t.origin_institution}</p>
              <span className="text-[10px] text-gray-400">{t.items?.length ?? 0} asignatura(s)</span>
            </button>
            ))
          })()}
        </div>
      </div>

      {/* Panel derecho */}
      <div className="flex-1 min-w-0">
        {creating ? (
          <NewTransferForm programs={programs} scales={scales} onCancel={() => setCreating(false)}
            onCreated={async (id) => { await loadList(); await openTransfer(id) }} />
        ) : detail ? (
          <TransferDetail
            key={detail.transfer.id}
            detail={detail} program={program} scale={scale} destPassing={destPassing}
            onReload={() => openTransfer(detail.transfer.id)} onDelete={() => delTransfer(detail.transfer.id)}
          />
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-20 text-center text-gray-400">
            <FileCheck className="w-10 h-10 mx-auto mb-3" />
            <p className="text-sm">Selecciona una convalidación o crea una nueva</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Formulario nueva convalidación ──────────────────────────────────────────
function NewTransferForm({ programs, scales, onCancel, onCreated }: {
  programs: Program[]; scales: Scale[]; onCancel: () => void; onCreated: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [student, setStudent] = useState<StudentHit | null>(null)
  const [enrolled, setEnrolled] = useState<{ id: string; name: string }[] | null>(null)
  const [originInst, setOriginInst] = useState('')
  const [originProg, setOriginProg] = useState('')
  const [destProg, setDestProg] = useState('')
  const [scaleId, setScaleId] = useState('')
  const [saving, setSaving] = useState(false)

  async function search(value: string) {
    setQ(value); setStudent(null)
    if (value.trim().length < 2) { setHits([]); return }
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(value.trim())}`).then(r => r.json())
    setHits(d.students ?? [])
  }

  async function selectStudent(h: StudentHit) {
    setStudent(h); setHits([]); setQ(''); setDestProg(''); setEnrolled(null)
    const d = await fetch(`/api/students/${h.id}/programs`).then(r => r.json()).catch(() => ({ programs: [] }))
    const progs: { id: string; name: string }[] = d.programs ?? []
    setEnrolled(progs)
    if (progs.length === 1) setDestProg(progs[0].id)
  }

  // Programas del dropdown: los matriculados; si no hay matrícula detectada, todos (fallback)
  const destOptions = (enrolled && enrolled.length > 0) ? enrolled : programs
  const usingFallback = !!student && enrolled != null && enrolled.length === 0

  async function create() {
    if (!student || !originInst || !destProg || !scaleId) return
    setSaving(true)
    const res = await fetch('/api/academic/transfer-credits', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: student.id, student_document: student.document_number, student_name: student.name,
        origin_institution: originInst, origin_program: originProg || null,
        dest_program_id: destProg, scale_id: scaleId,
      }),
    })
    setSaving(false)
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error ?? 'Error'); return }
    const d = await res.json()
    onCreated(d.id)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Nueva convalidación</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      {/* Estudiante */}
      <label className="block text-xs font-medium text-gray-600 mb-1">Estudiante</label>
      {student ? (
        <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 mb-4 bg-blue-50">
          <div>
            <p className="text-sm font-medium text-gray-800">{student.name}</p>
            <p className="text-xs text-gray-500">{student.document_number ?? student.email}</p>
          </div>
          <button onClick={() => { setStudent(null); setQ(''); setEnrolled(null); setDestProg('') }} className="text-xs text-blue-600">Cambiar</button>
        </div>
      ) : (
        <div className="relative mb-4">
          <div className="flex items-center border border-gray-200 rounded-lg px-3">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={q} onChange={e => search(e.target.value)} placeholder="Nombre, documento o correo…"
              className="flex-1 px-2 py-2 text-sm focus:outline-none" />
          </div>
          {hits.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
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
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Institución de origen</label>
          <input value={originInst} onChange={e => setOriginInst(e.target.value)} placeholder="Universidad …"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Programa de origen</label>
          <input value={originProg} onChange={e => setOriginProg(e.target.value)} placeholder="Carrera de origen"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Programa de destino {student && enrolled && enrolled.length > 0 && <span className="text-gray-400 font-normal">(matriculado)</span>}
          </label>
          <select value={destProg} onChange={e => setDestProg(e.target.value)} disabled={!student}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400">
            <option value="">{student ? 'Elegir…' : 'Elige primero al estudiante'}</option>
            {destOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {usingFallback && <p className="text-[11px] text-amber-600 mt-1">No se encontró matrícula registrada; mostrando todos los programas.</p>}
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
        <button onClick={create} disabled={saving || !student || !originInst || !destProg || !scaleId}
          className="flex items-center gap-1.5 text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Crear convalidación
        </button>
      </div>
    </div>
  )
}

// ── Detalle: ítems + conversión ─────────────────────────────────────────────
function TransferDetail({ detail, program, scale, destPassing, onReload, onDelete }: {
  detail: { transfer: Transfer; items: TItem[] }; program?: Program; scale?: Scale; destPassing: number | null
  onReload: () => void; onDelete: () => void
}) {
  const { transfer, items } = detail
  const [pdfDate, setPdfDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [originCode, setOriginCode] = useState('')
  const [originName, setOriginName] = useState('')
  const [originCredits, setOriginCredits] = useState('')
  const [destCourse, setDestCourse] = useState('')
  const [grade, setGrade] = useState('')
  const [adding, setAdding] = useState(false)

  const courses = program?.courses ?? []
  const preview = (scale && destPassing != null && grade !== '')
    ? convertGrade(Number(grade), scale, destPassing) : null

  async function addItem() {
    if (!originName) return
    setAdding(true)
    const c = courses.find(x => x.id === destCourse)
    await fetch(`/api/academic/transfer-credits/${transfer.id}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin_course_name: originName, origin_course_code: originCode || null,
        origin_credits: originCredits === '' ? null : Number(originCredits),
        dest_course_id: destCourse || null, dest_course_name: c?.name ?? null,
        origin_grade: grade === '' ? null : Number(grade),
      }),
    })
    setAdding(false); setOriginCode(''); setOriginName(''); setOriginCredits(''); setDestCourse(''); setGrade('')
    onReload()
  }
  async function updateItem(itemId: string, patch: Record<string, string>) {
    await fetch(`/api/academic/transfer-credit-items/${itemId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    onReload()
  }
  async function delItem(itemId: string) {
    await fetch(`/api/academic/transfer-credit-items/${itemId}`, { method: 'DELETE' })
    onReload()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Cabecera */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{transfer.student_name}</h2>
          <p className="text-xs text-gray-500">{transfer.student_document}</p>
          <div className="flex items-center gap-2 mt-2 text-sm text-gray-600 flex-wrap">
            <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{transfer.origin_institution}{transfer.origin_program ? ` · ${transfer.origin_program}` : ''}</span>
            <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">{program?.name ?? '—'}</span>
            <span className="px-2 py-0.5 bg-gray-50 text-gray-500 rounded-full text-xs">Escala: {scale?.name ?? '—'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={pdfDate} onChange={e => setPdfDate(e.target.value)} title="Fecha del formato"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <a href={`/api/academic/transfer-credits/${transfer.id}/pdf${pdfDate ? `?date=${pdfDate}` : ''}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            <Download className="w-3.5 h-3.5" /> Descargar PDF
          </a>
          <button onClick={onDelete} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {destPassing == null && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          La categoría de este programa no tiene nota de aprobación configurada. Ponla en <strong>Escalas de conversión</strong> para calcular las notas.
        </div>
      )}

      {/* Tabla de ítems */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="py-2 pr-2 w-16">N° origen</th>
            <th className="py-2 pr-3">Asignatura de origen</th>
            <th className="py-2 pr-2 w-14">Cr.</th>
            <th className="py-2 pr-2 w-16">Nota</th>
            <th className="py-2 pr-3">Asignatura de destino</th>
            <th className="py-2 pr-2 w-16">= 0–100</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map(it => (
            <tr key={it.id}>
              <td className="py-2 pr-2">
                <input defaultValue={it.origin_course_code ?? ''} placeholder="—"
                  onBlur={e => { if (String(it.origin_course_code ?? '') !== e.target.value) updateItem(it.id, { origin_course_code: e.target.value }) }}
                  className="w-14 border border-gray-200 rounded px-2 py-1 text-sm" />
              </td>
              <td className="py-2 pr-3 text-gray-800">{it.origin_course_name}</td>
              <td className="py-2 pr-2">
                <input type="number" defaultValue={it.origin_credits ?? ''} placeholder="—"
                  onBlur={e => { if (String(it.origin_credits ?? '') !== e.target.value) updateItem(it.id, { origin_credits: e.target.value }) }}
                  className="w-12 border border-gray-200 rounded px-2 py-1 text-sm" />
              </td>
              <td className="py-2 pr-2">
                <input type="number" defaultValue={it.origin_grade ?? ''} placeholder="—"
                  onBlur={e => { if (String(it.origin_grade ?? '') !== e.target.value) updateItem(it.id, { origin_grade: e.target.value }) }}
                  className="w-14 border border-gray-200 rounded px-2 py-1 text-sm" />
              </td>
              <td className="py-2 pr-3 text-gray-600">{it.dest_course_name ?? '—'}</td>
              <td className="py-2 pr-2">
                <span className={`font-semibold ${it.converted_grade != null ? 'text-blue-700' : 'text-gray-300'}`}>{it.converted_grade ?? '—'}</span>
              </td>
              <td className="py-2 text-right">
                <button onClick={() => delItem(it.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </td>
            </tr>
          ))}
          {/* fila agregar */}
          <tr className="bg-gray-50/50">
            <td className="py-2 pr-2"><input value={originCode} onChange={e => setOriginCode(e.target.value)} placeholder="101" className="w-14 border border-gray-200 rounded px-2 py-1 text-sm" /></td>
            <td className="py-2 pr-2"><input value={originName} onChange={e => setOriginName(e.target.value)} placeholder="Denominación origen" className="w-full border border-gray-200 rounded px-2 py-1 text-sm" /></td>
            <td className="py-2 pr-2"><input type="number" value={originCredits} onChange={e => setOriginCredits(e.target.value)} placeholder="03" className="w-12 border border-gray-200 rounded px-2 py-1 text-sm" /></td>
            <td className="py-2 pr-2"><input type="number" value={grade} onChange={e => setGrade(e.target.value)} placeholder="opc." className="w-14 border border-gray-200 rounded px-2 py-1 text-sm" /></td>
            <td className="py-2 pr-2">
              <select value={destCourse} onChange={e => setDestCourse(e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white">
                <option value="">Elegir asignatura…</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </td>
            <td className="py-2 pr-2"><span className="text-blue-700 font-semibold text-sm">{preview ?? '—'}</span></td>
            <td className="py-2 text-right">
              <button onClick={addItem} disabled={adding || !originName}
                className="inline-flex items-center gap-1 text-xs font-medium bg-blue-600 text-white px-2 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-3">La nota es opcional: puedes vincular ahora y completar la calificación después. Al tener nota, la asignatura aparece como <strong>Convalidado</strong> en las notas del estudiante.</p>
    </div>
  )
}
