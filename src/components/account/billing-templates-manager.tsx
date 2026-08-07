'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Pencil, AlertTriangle, CalendarClock } from 'lucide-react'

interface Template {
  id: string; name: string; currency: string
  registration_fee: number; registration_concept: number | null
  installments_count: number; installment_amount: number; installment_concept: number | null
}
interface Target { id: string; template_id: string; program_id: string | null; category_id: string | null }
interface Prog { id: string; name: string; category_id: string | null }
interface Cat { id: string; name: string }
interface Concept { type_code: number; abbr: string | null; name: string | null }

const money = (n: number) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const VACIA = {
  id: '', name: '', currency: 'USD',
  registration_fee: '', registration_concept: '',
  installments_count: '', installment_amount: '', installment_concept: '',
  program_ids: [] as string[], category_ids: [] as string[],
}

export function BillingTemplatesManager() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [progs, setProgs] = useState<Prog[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [huerfanos, setHuerfanos] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({ ...VACIA })
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  // Simulador de la regla de fechas
  const [inicio, setInicio] = useState('')
  const [primera, setPrimera] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const d = await fetch('/api/billing/templates').then(r => r.json())
    setTemplates(d.templates ?? []); setTargets(d.targets ?? [])
    setProgs(d.programs ?? []); setCats(d.categories ?? [])
    setConcepts(d.concepts ?? []); setHuerfanos(d.huerfanos ?? [])
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!inicio) { setPrimera(null); return }
    fetch('/api/billing/templates', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_day: inicio }),
    }).then(r => r.json()).then(d => setPrimera(d.primera_cuota ?? null)).catch(() => setPrimera(null))
  }, [inicio])

  function editar(t: Template) {
    const mios = targets.filter(x => x.template_id === t.id)
    setForm({
      id: t.id, name: t.name, currency: t.currency,
      registration_fee: String(t.registration_fee ?? ''), registration_concept: String(t.registration_concept ?? ''),
      installments_count: String(t.installments_count ?? ''), installment_amount: String(t.installment_amount ?? ''),
      installment_concept: String(t.installment_concept ?? ''),
      program_ids: mios.filter(x => x.program_id).map(x => x.program_id!),
      category_ids: mios.filter(x => x.category_id).map(x => x.category_id!),
    })
    setAbierto(true); setError(null)
  }

  async function guardar() {
    setGuardando(true); setError(null)
    const d = await fetch('/api/billing/templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: form.id || undefined, name: form.name, currency: form.currency,
        registration_fee: Number(form.registration_fee || 0),
        registration_concept: form.registration_concept ? Number(form.registration_concept) : null,
        installments_count: Number(form.installments_count || 0),
        installment_amount: Number(form.installment_amount || 0),
        installment_concept: form.installment_concept ? Number(form.installment_concept) : null,
        program_ids: form.program_ids, category_ids: form.category_ids,
      }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setGuardando(false)
    if (d.error) { setError(d.error); return }
    setForm({ ...VACIA }); setAbierto(false); cargar()
  }

  async function borrar(t: Template) {
    if (!confirm(`¿Eliminar la plantilla "${t.name}"? Los programas que la usan quedarán sin plantilla y sus matrículas nuevas no generarán cuotas.`)) return
    const d = await fetch('/api/billing/templates', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }),
    }).then(r => r.json())
    if (d.error) { setError(d.error); return }
    cargar()
  }

  const nombreConcepto = (c: number | null) => {
    if (c == null) return '—'
    const x = concepts.find(k => Number(k.type_code) === Number(c))
    return x ? (x.abbr ?? x.name ?? String(c)) : String(c)
  }
  const toggle = (lista: string[], id: string) => lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id]
  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm'

  if (cargando) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-4">
      {/* La regla, explicada y comprobable: quien configura puede verla actuar
          sobre una fecha real antes de confiar en ella. */}
      <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4">
        <p className="text-sm text-blue-900 font-medium inline-flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4" /> La primera cuota se calcula sola
        </p>
        <p className="text-xs text-blue-800/80 mt-1">
          Día 1 del mes siguiente a <strong>inicio de clases + 20 días</strong>. Todas las cuotas vencen el día 1.
          Por eso una plantilla sirve para todas las convocatorias del programa.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
            className="border border-blue-200 rounded-lg px-2 py-1 text-xs bg-white" />
          <span className="text-xs text-blue-900">
            {primera ? <>→ primera cuota: <strong>{primera.split('-').reverse().join('/')}</strong></> : 'prueba una fecha de inicio'}
          </span>
        </div>
      </div>

      {huerfanos.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-800 inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <strong>{huerfanos.length} programa(s) sin plantilla</strong> — sus matrículas nuevas no generarán cuotas.
          </p>
          <p className="text-[11px] text-amber-700 mt-1">{huerfanos.slice(0, 8).map(h => h.name).join(' · ')}{huerfanos.length > 8 ? ` … y ${huerfanos.length - 8} más` : ''}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => { setForm({ ...VACIA }); setAbierto(true); setError(null) }}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">
          <Plus className="w-4 h-4" /> Nueva plantilla
        </button>
      </div>

      {abierto && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">{form.id ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className="block text-xs text-gray-600 mb-1">Nombre</span>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Master 18 cuotas" className={inp} />
            </label>
            <label>
              <span className="block text-xs text-gray-600 mb-1">Matrícula (monto)</span>
              <input type="number" step="0.01" value={form.registration_fee}
                onChange={e => setForm({ ...form, registration_fee: e.target.value })} placeholder="0.00" className={inp} />
            </label>
            <label>
              <span className="block text-xs text-gray-600 mb-1">Concepto matrícula</span>
              <select value={form.registration_concept} onChange={e => setForm({ ...form, registration_concept: e.target.value })} className={inp}>
                <option value="">—</option>
                {concepts.map(c => <option key={c.type_code} value={c.type_code}>{c.abbr ?? c.name}</option>)}
              </select>
            </label>
            <label>
              <span className="block text-xs text-gray-600 mb-1">N° de cuotas</span>
              <input type="number" value={form.installments_count}
                onChange={e => setForm({ ...form, installments_count: e.target.value })} placeholder="0" className={inp} />
            </label>
            <label>
              <span className="block text-xs text-gray-600 mb-1">Monto por cuota</span>
              <input type="number" step="0.01" value={form.installment_amount}
                onChange={e => setForm({ ...form, installment_amount: e.target.value })} placeholder="0.00" className={inp} />
            </label>
            <label>
              <span className="block text-xs text-gray-600 mb-1">Concepto cuota</span>
              <select value={form.installment_concept} onChange={e => setForm({ ...form, installment_concept: e.target.value })} className={inp}>
                <option value="">—</option>
                {concepts.map(c => <option key={c.type_code} value={c.type_code}>{c.abbr ?? c.name}</option>)}
              </select>
            </label>
            <label>
              <span className="block text-xs text-gray-600 mb-1">Moneda</span>
              <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className={inp} />
            </label>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Categorías completas</p>
            <div className="flex flex-wrap gap-1.5">
              {cats.map(c => (
                <button key={c.id} onClick={() => setForm({ ...form, category_ids: toggle(form.category_ids, c.id) })}
                  className={`text-xs px-2.5 py-1 rounded-full border ${form.category_ids.includes(c.id)
                    ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            {/* El programa gana a la categoría, igual que en el tarifario. */}
            <p className="text-xs font-medium text-gray-700 mb-1">
              Programas sueltos <span className="font-normal text-gray-400">— si un programa está aquí, manda sobre su categoría</span>
            </p>
            <div className="max-h-48 overflow-auto border border-gray-100 rounded-lg p-2 flex flex-wrap gap-1.5">
              {progs.map(p => (
                <button key={p.id} onClick={() => setForm({ ...form, program_ids: toggle(form.program_ids, p.id) })}
                  className={`text-xs px-2.5 py-1 rounded-full border ${form.program_ids.includes(p.id)
                    ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAbierto(false); setForm({ ...VACIA }) }} className="px-3 py-1.5 text-sm text-gray-600">Cancelar</button>
            <button onClick={guardar} disabled={guardando || !form.name.trim()}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-40">
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {templates.length === 0 && <p className="text-sm text-gray-400 px-4 py-8 text-center">Todavía no hay plantillas.</p>}
        {templates.map(t => {
          const mios = targets.filter(x => x.template_id === t.id)
          const nProg = mios.filter(x => x.program_id).length
          const nCat = mios.filter(x => x.category_id).length
          return (
            <div key={t.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-400">
                  {nCat > 0 && <>{nCat} categoría(s)</>}{nCat > 0 && nProg > 0 && ' · '}{nProg > 0 && <>{nProg} programa(s)</>}
                  {nCat === 0 && nProg === 0 && <span className="text-amber-600">sin asignar — no se aplica a nadie</span>}
                </p>
              </div>
              <span className="text-sm text-gray-700 tabular-nums">
                {t.currency} {money(t.registration_fee)} <span className="text-gray-400 text-xs">{nombreConcepto(t.registration_concept)}</span>
              </span>
              <span className="text-sm text-gray-700 tabular-nums w-32 text-right">
                {t.installments_count} × {money(t.installment_amount)}
              </span>
              <button onClick={() => editar(t)} className="text-gray-300 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => borrar(t)} className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
