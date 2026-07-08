'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trash2, Plus, Loader2, Pencil, X } from 'lucide-react'

interface Concept { type_code: number; abbr: string | null; name: string | null }
interface Ref { id: string; name: string }
interface Plan {
  id: string; program_id: string; convocatoria_id: string; currency: string
  registration_fee: number; registration_concept: number | null
  installments_count: number; installment_amount: number; installment_concept: number | null
  first_due_date: string | null; due_day: number | null
}

const blank = {
  program_id: '', convocatoria_id: '', currency: 'USD',
  registration_fee: '', registration_concept: '',
  installments_count: '', installment_amount: '', installment_concept: '',
  first_due_date: '', due_day: '',
}

export function BillingPlansManager() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [programs, setPrograms] = useState<Ref[]>([])
  const [convocatorias, setConvocatorias] = useState<Ref[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Record<string, string>>({ ...blank })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch('/api/billing/plans').then(r => r.json())
    setPlans(d.plans ?? []); setPrograms(d.programs ?? []); setConvocatorias(d.convocatorias ?? []); setConcepts(d.concepts ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const nameOf = (list: Ref[], id: string) => list.find(x => x.id === id)?.name ?? '—'
  const conceptLabel = (t: number | null) => {
    if (t == null) return '—'
    const c = concepts.find(x => x.type_code === t)
    return c ? `${c.abbr ?? 'T' + t} · ${c.name ?? ''}` : `T${t}`
  }
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  function editPlan(p: Plan) {
    setEditingId(p.id)
    setForm({
      program_id: p.program_id, convocatoria_id: p.convocatoria_id, currency: p.currency,
      registration_fee: String(p.registration_fee ?? ''), registration_concept: p.registration_concept?.toString() ?? '',
      installments_count: String(p.installments_count ?? ''), installment_amount: String(p.installment_amount ?? ''),
      installment_concept: p.installment_concept?.toString() ?? '',
      first_due_date: p.first_due_date ?? '', due_day: p.due_day?.toString() ?? '',
    })
  }
  function cancel() { setEditingId(null); setForm({ ...blank }) }

  async function save() {
    if (!form.program_id || !form.convocatoria_id) return
    setSaving(true)
    await fetch('/api/billing/plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    setSaving(false); cancel(); load()
  }

  async function del(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return
    await fetch(`/api/billing/plans?id=${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>

  const conceptOptions = [<option key="" value="">—</option>,
    ...concepts.map(c => <option key={c.type_code} value={c.type_code}>{c.abbr ?? 'T' + c.type_code} · {c.name ?? c.type_code}</option>)]

  return (
    <div className="space-y-6">
      {/* Formulario */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{editingId ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
          {editingId && <button onClick={cancel} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"><X className="w-3.5 h-3.5" />Cancelar</button>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Programa">
            <select value={form.program_id} onChange={e => set('program_id', e.target.value)} className={inp}>
              <option value="">Seleccionar…</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Convocatoria">
            <select value={form.convocatoria_id} onChange={e => set('convocatoria_id', e.target.value)} className={inp}>
              <option value="">Seleccionar…</option>
              {convocatorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Matrícula (monto)"><input type="number" value={form.registration_fee} onChange={e => set('registration_fee', e.target.value)} className={inp} placeholder="0.00" /></Field>
          <Field label="Concepto matrícula"><select value={form.registration_concept} onChange={e => set('registration_concept', e.target.value)} className={inp}>{conceptOptions}</select></Field>
          <Field label="N° de cuotas"><input type="number" value={form.installments_count} onChange={e => set('installments_count', e.target.value)} className={inp} placeholder="0" /></Field>
          <Field label="Monto por cuota"><input type="number" value={form.installment_amount} onChange={e => set('installment_amount', e.target.value)} className={inp} placeholder="0.00" /></Field>
          <Field label="Concepto cuota"><select value={form.installment_concept} onChange={e => set('installment_concept', e.target.value)} className={inp}>{conceptOptions}</select></Field>
          <Field label="Moneda"><input value={form.currency} onChange={e => set('currency', e.target.value)} className={inp} /></Field>
          <Field label="1ª fecha de vencimiento"><input type="date" value={form.first_due_date} onChange={e => set('first_due_date', e.target.value)} className={inp} /></Field>
          <Field label="Día de vencimiento (opc.)"><input type="number" min={1} max={31} value={form.due_day} onChange={e => set('due_day', e.target.value)} className={inp} placeholder="usa día de la 1ª cuota" /></Field>
        </div>
        <button onClick={save} disabled={saving || !form.program_id || !form.convocatoria_id}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{editingId ? 'Guardar cambios' : 'Crear plantilla'}
        </button>
      </div>

      {/* Lista */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wide">
              <th className="text-left px-4 py-2.5">Programa</th>
              <th className="text-left px-4 py-2.5">Convocatoria</th>
              <th className="text-right px-4 py-2.5">Matrícula</th>
              <th className="text-right px-4 py-2.5">Cuotas</th>
              <th className="text-left px-4 py-2.5">1ª cuota</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin plantillas</td></tr>
            ) : plans.map(p => (
              <tr key={p.id} className="border-t border-gray-50">
                <td className="px-4 py-2.5 text-gray-800">{nameOf(programs, p.program_id)}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{nameOf(convocatorias, p.convocatoria_id)}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">{p.currency} {Number(p.registration_fee).toFixed(2)}<span className="text-gray-300 text-xs ml-1">{p.registration_concept != null ? conceptLabel(p.registration_concept).split(' · ')[0] : ''}</span></td>
                <td className="px-4 py-2.5 text-right text-gray-700">{p.installments_count} × {Number(p.installment_amount).toFixed(2)}</td>
                <td className="px-4 py-2.5 text-gray-500">{p.first_due_date ?? '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => editPlan(p)} className="text-gray-400 hover:text-blue-600 mr-3"><Pencil className="w-4 h-4 inline" /></button>
                  <button onClick={() => del(p.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4 inline" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-gray-500 mb-1">{label}</span>{children}</label>
}
