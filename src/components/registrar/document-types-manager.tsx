'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Loader2, Pencil, X, Save, FileText } from 'lucide-react'

interface Concept { type_code: number; abbr: string | null; name: string | null }
interface Req { kind: string; description: string }
interface StageForm { name: string; fieldsText: string }
interface DocType {
  id: string; name: string; description: string | null; price: number; currency: string
  charge_concept: number | null; template_body: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requirements: Req[]; stages: any[]; active: boolean
}

const REQ_KINDS = [
  { value: 'graduated', label: 'Egresado (100% aprobado)' },
  { value: 'no_debt', label: 'Sin deuda (saldo 0)' },
  { value: 'enrolled', label: 'Matriculado / activo' },
  { value: 'manual', label: 'Manual (lo verifica un colaborador)' },
]
const reqLabel = (k: string) => REQ_KINDS.find(r => r.value === k)?.label ?? k

const blank = () => ({
  id: '' as string, name: '', description: '', price: '', currency: 'USD', charge_concept: '',
  template_body: '', requirements: [] as Req[], stages: [] as StageForm[], active: true,
})

export function DocumentTypesManager() {
  const [types, setTypes] = useState<DocType[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blank())

  const load = useCallback(async () => {
    const d = await fetch('/api/registrar/document-types').then(r => r.json())
    setTypes(d.types ?? []); setConcepts(d.concepts ?? []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  function newType() { setForm(blank()); setEditing(true) }
  function editType(t: DocType) {
    setForm({
      id: t.id, name: t.name, description: t.description ?? '', price: String(t.price ?? ''), currency: t.currency,
      charge_concept: t.charge_concept?.toString() ?? '', template_body: t.template_body ?? '',
      requirements: (t.requirements ?? []).map(r => ({ kind: r.kind, description: r.description ?? '' })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stages: (t.stages ?? []).map((s: any) => ({ name: s.name ?? '', fieldsText: (s.fields ?? []).map((f: any) => f.label).join(', ') })),
      active: t.active,
    })
    setEditing(true)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const stages = form.stages.filter(s => s.name.trim()).map(s => ({
      name: s.name.trim(),
      fields: s.fieldsText.split(',').map(x => x.trim()).filter(Boolean).map(label => ({ key: label.toLowerCase().replace(/\s+/g, '_'), label })),
    }))
    const body = {
      id: form.id || undefined, name: form.name, description: form.description, price: form.price,
      currency: form.currency, charge_concept: form.charge_concept, template_body: form.template_body,
      requirements: form.requirements.filter(r => r.kind), stages, active: form.active,
    }
    await fetch('/api/registrar/document-types', {
      method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setSaving(false); setEditing(false); load()
  }
  async function del(id: string) {
    if (!confirm('¿Eliminar este tipo de documento?')) return
    await fetch(`/api/registrar/document-types?id=${id}`, { method: 'DELETE' }); load()
  }

  if (loading) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>

  if (editing) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{form.id ? 'Editar tipo de documento' : 'Nuevo tipo de documento'}</h3>
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nombre *"><input value={form.name} onChange={e => setF('name', e.target.value)} className={inp} placeholder="Ej. Constancia de egresado" /></Field>
          <Field label="Precio"><div className="flex gap-2"><select value={form.currency} onChange={e => setF('currency', e.target.value)} className={`${inp} w-24`}><option>USD</option><option>PEN</option></select><input type="number" value={form.price} onChange={e => setF('price', e.target.value)} className={inp} placeholder="0.00" /></div></Field>
          <Field label="Descripción"><input value={form.description} onChange={e => setF('description', e.target.value)} className={inp} /></Field>
          <Field label="Concepto del cargo (estado de cuenta)"><select value={form.charge_concept} onChange={e => setF('charge_concept', e.target.value)} className={inp}><option value="">—</option>{concepts.map(c => <option key={c.type_code} value={c.type_code}>{c.abbr ?? 'T' + c.type_code} · {c.name ?? c.type_code}</option>)}</select></Field>
        </div>

        {/* Requisitos */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-600">Requisitos</label>
            <button onClick={() => setF('requirements', [...form.requirements, { kind: 'graduated', description: '' }])} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Agregar</button>
          </div>
          {form.requirements.length === 0 ? <p className="text-xs text-gray-400">Sin requisitos.</p> : (
            <div className="space-y-2">
              {form.requirements.map((r, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={r.kind} onChange={e => { const rr = [...form.requirements]; rr[i] = { ...rr[i], kind: e.target.value }; setF('requirements', rr) }} className={`${inp} w-64`}>
                    {REQ_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                  <input value={r.description} onChange={e => { const rr = [...form.requirements]; rr[i] = { ...rr[i], description: e.target.value }; setF('requirements', rr) }} className={inp} placeholder="Detalle (opcional)" />
                  <button onClick={() => setF('requirements', form.requirements.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Etapas humanas */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-600">Etapas humanas <span className="text-gray-400 font-normal">(visto bueno / campos a completar)</span></label>
            <button onClick={() => setF('stages', [...form.stages, { name: '', fieldsText: '' }])} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Agregar</button>
          </div>
          {form.stages.length === 0 ? <p className="text-xs text-gray-400">Sin etapas (se emite automáticamente al cumplir requisitos y pago).</p> : (
            <div className="space-y-2">
              {form.stages.map((s, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={s.name} onChange={e => { const ss = [...form.stages]; ss[i] = { ...ss[i], name: e.target.value }; setF('stages', ss) }} className={`${inp} w-56`} placeholder={`Etapa ${i + 1} (ej. VoBo Decano)`} />
                  <input value={s.fieldsText} onChange={e => { const ss = [...form.stages]; ss[i] = { ...ss[i], fieldsText: e.target.value }; setF('stages', ss) }} className={inp} placeholder="Campos a completar, separados por coma (opcional)" />
                  <button onClick={() => setF('stages', form.stages.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plantilla */}
        <div>
          <label className="text-xs font-semibold text-gray-600">Plantilla del documento</label>
          <p className="text-[11px] text-gray-400 mb-1">Usa variables: <code>{'{{student_name}}'}</code>, <code>{'{{document_number}}'}</code>, <code>{'{{program}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{date}}'}</code> y los campos de etapas.</p>
          <textarea value={form.template_body} onChange={e => setF('template_body', e.target.value)} rows={6} className={inp} placeholder="Texto del documento con variables…" />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving || !form.name.trim()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</button>
          <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={form.active} onChange={e => setF('active', e.target.checked)} className="accent-blue-600" />Activo</label>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={newType} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4" />Nuevo tipo</button>
      </div>
      {types.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">Aún no hay tipos de documento. Crea el primero.</p>
      ) : (
        <div className="grid gap-3">
          {types.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-gray-300 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">{t.name}{!t.active && <span className="ml-2 text-[11px] text-gray-400">(inactivo)</span>}</p>
                  {t.description && <p className="text-xs text-gray-400">{t.description}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                    <span>{Number(t.price) > 0 ? `${t.currency} ${Number(t.price).toFixed(2)}` : 'Gratuito'}</span>
                    <span>{(t.requirements ?? []).length} requisito(s)</span>
                    <span>{(t.stages ?? []).length} etapa(s)</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => editType(t)} className="text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => del(t.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-gray-500 mb-1">{label}</span>{children}</label>
}
