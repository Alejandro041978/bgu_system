'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Loader2, Pencil, X, Save, FileText } from 'lucide-react'

interface Concept { type_code: number; abbr: string | null; name: string | null }
interface Employee { id: string; full_name: string; position: string | null }
interface Req { kind: string; description: string }
interface StageForm { name: string; assigneeId: string; kind: 'vb' | 'fields'; tagsText: string }
interface FieldMap { tag: string; source: string; value: string }
interface Category { id: string; name: string }
interface Program { id: string; name: string; category_id: string | null }
interface DocType {
  id: string; name: string; description: string | null; price: number; currency: string
  charge_concept: number | null; template_body: string | null; simplecert_project_id: string | null
  sample_image_url: string | null
  field_map: FieldMap[]; scope_category_id: string | null; scope_program_ids: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requirements: Req[]; stages: any[]; active: boolean
}

// Fuentes de dato del ERP para llenar cada merge tag de la plantilla SimpleCert.
const MAP_SOURCES = [
  { value: 'first_name', label: 'Nombres del estudiante' },
  { value: 'last_name_p', label: 'Apellido paterno' },
  { value: 'last_name_m', label: 'Apellido materno' },
  { value: 'last_name', label: 'Apellidos (paterno + materno)' },
  { value: 'full_name', label: 'Nombre completo' },
  { value: 'email', label: 'Correo' },
  { value: 'document_number', label: 'Nº de documento' },
  { value: 'program', label: 'Programa' },
  { value: 'category', label: 'Categoría' },
  { value: 'credits_total', label: 'Total de créditos del programa' },
  { value: 'hours_total', label: 'Total de horas del programa' },
  { value: 'date_short', label: 'Fecha (dd/mm/aaaa)' },
  { value: 'date_long', label: 'Fecha larga en español (9 de julio de 2026)' },
  { value: 'date_long_en', label: 'Fecha larga en inglés (July 9, 2026)' },
  { value: 'request_code', label: 'Código de solicitud' },
  { value: 'literal', label: 'Texto fijo…' },
]

const REQ_KINDS = [
  { value: 'graduated', label: 'Egresado (100% aprobado)' },
  { value: 'no_debt', label: 'Sin deuda (saldo 0)' },
  { value: 'enrolled', label: 'Matriculado / activo' },
  { value: 'manual', label: 'Manual (lo verifica un colaborador)' },
]
const reqLabel = (k: string) => REQ_KINDS.find(r => r.value === k)?.label ?? k

const blank = () => ({
  id: '' as string, name: '', description: '', price: '', currency: 'USD', charge_concept: '',
  template_body: '', simplecert_project_id: '', sample_image_url: '', field_map: [] as FieldMap[],
  scope_mode: 'all' as 'all' | 'category' | 'programs', scope_category_id: '', scope_program_ids: [] as string[],
  requirements: [] as Req[], stages: [] as StageForm[], active: true,
})

export function DocumentTypesManager() {
  const [types, setTypes] = useState<DocType[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blank())
  const [progFilter, setProgFilter] = useState('')
  const [uploading, setUploading] = useState(false)

  async function uploadSample(file: File) {
    setUploading(true)
    const fd = new FormData(); fd.append('file', file)
    const d = await fetch('/api/registrar/document-types/sample', { method: 'POST', body: fd }).then(r => r.json())
    setUploading(false)
    if (d.error) { alert(d.error); return }
    setForm(f => ({ ...f, sample_image_url: d.url }))
  }

  const load = useCallback(async () => {
    const d = await fetch('/api/registrar/document-types').then(r => r.json())
    setTypes(d.types ?? []); setConcepts(d.concepts ?? [])
    setCategories(d.categories ?? []); setPrograms(d.programs ?? []); setEmployees(d.employees ?? []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  function newType() { setForm(blank()); setEditing(true) }
  function editType(t: DocType) {
    setForm({
      id: t.id, name: t.name, description: t.description ?? '', price: String(t.price ?? ''), currency: t.currency,
      charge_concept: t.charge_concept?.toString() ?? '', template_body: t.template_body ?? '',
      simplecert_project_id: t.simplecert_project_id ?? '', sample_image_url: t.sample_image_url ?? '',
      field_map: (t.field_map ?? []).map(m => ({ tag: m.tag ?? '', source: m.source ?? 'first_name', value: m.value ?? '' })),
      scope_mode: (t.scope_program_ids ?? []).length > 0 ? 'programs' : t.scope_category_id ? 'category' : 'all',
      scope_category_id: t.scope_category_id ?? '', scope_program_ids: t.scope_program_ids ?? [],
      requirements: (t.requirements ?? []).map(r => ({ kind: r.kind, description: r.description ?? '' })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stages: (t.stages ?? []).map((s: any) => ({
        name: s.name ?? '', assigneeId: s.assignee_id ?? '',
        kind: (s.kind ?? ((s.fields ?? []).length ? 'fields' : 'vb')) as 'vb' | 'fields',
        tagsText: (s.fields ?? []).map((f: any) => f.label ?? f.key).join(', '),
      })),
      active: t.active,
    })
    setEditing(true)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const stages = form.stages.filter(s => s.name.trim()).map(s => {
      const emp = employees.find(e => e.id === s.assigneeId)
      return {
        name: s.name.trim(),
        assignee_id: s.assigneeId || null,
        assignee_name: emp?.full_name ?? null,
        kind: s.kind,
        // Para 'fields' el merge tag se guarda tal cual (key = label = tag, sensible a mayúsculas).
        fields: s.kind === 'fields'
          ? s.tagsText.split(',').map(x => x.trim()).filter(Boolean).map(tag => ({ key: tag, label: tag }))
          : [],
      }
    })
    const body = {
      id: form.id || undefined, name: form.name, description: form.description, price: form.price,
      currency: form.currency, charge_concept: form.charge_concept, template_body: form.template_body,
      simplecert_project_id: form.simplecert_project_id, sample_image_url: form.sample_image_url,
      field_map: form.field_map.filter(m => m.tag.trim()).map(m => ({ tag: m.tag.trim(), source: m.source, value: m.source === 'literal' ? m.value : undefined })),
      scope_category_id: form.scope_mode === 'category' ? (form.scope_category_id || null) : null,
      scope_program_ids: form.scope_mode === 'programs' ? form.scope_program_ids : [],
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

        {/* Disponibilidad / alcance */}
        <div>
          <label className="text-xs font-semibold text-gray-600">Disponibilidad</label>
          <p className="text-[11px] text-gray-400 mb-1.5">Para qué programas se puede solicitar este documento.</p>
          <select value={form.scope_mode} onChange={e => setF('scope_mode', e.target.value)} className={`${inp} sm:w-72`}>
            <option value="all">Todos los programas</option>
            <option value="category">Solo una categoría</option>
            <option value="programs">Programas específicos</option>
          </select>

          {form.scope_mode === 'category' && (
            <select value={form.scope_category_id} onChange={e => setF('scope_category_id', e.target.value)} className={`${inp} sm:w-72 mt-2`}>
              <option value="">Seleccionar categoría…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {form.scope_mode === 'programs' && (
            <div className="mt-2 space-y-2">
              <input value={progFilter} onChange={e => setProgFilter(e.target.value)} className={`${inp} sm:w-72`} placeholder="Filtrar programas…" />
              <div className="border border-gray-200 rounded-lg max-h-52 overflow-auto divide-y divide-gray-50">
                {programs.filter(p => p.name.toLowerCase().includes(progFilter.toLowerCase())).map(p => {
                  const checked = form.scope_program_ids.includes(p.id)
                  return (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={checked} className="accent-blue-600"
                        onChange={() => setF('scope_program_ids', checked ? form.scope_program_ids.filter(x => x !== p.id) : [...form.scope_program_ids, p.id])} />
                      {p.name}
                    </label>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400">{form.scope_program_ids.length} programa(s) seleccionado(s).</p>
            </div>
          )}
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
            <label className="text-xs font-semibold text-gray-600">Etapas humanas <span className="text-gray-400 font-normal">(responsable · visto bueno o campos)</span></label>
            <button onClick={() => setF('stages', [...form.stages, { name: '', assigneeId: '', kind: 'vb', tagsText: '' }])} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Agregar</button>
          </div>
          {form.stages.length === 0 ? <p className="text-xs text-gray-400">Sin etapas (se emite automáticamente al cumplir requisitos y pago).</p> : (
            <div className="space-y-2">
              {form.stages.map((s, i) => {
                const upd = (patch: Partial<StageForm>) => { const ss = [...form.stages]; ss[i] = { ...ss[i], ...patch }; setF('stages', ss) }
                return (
                  <div key={i} className="border border-gray-200 rounded-lg p-2.5 space-y-2 bg-gray-50/50">
                    <div className="flex gap-2 items-center">
                      <input value={s.name} onChange={e => upd({ name: e.target.value })} className={`${inp} flex-1`} placeholder={`Etapa ${i + 1} (ej. VoBo Decano)`} />
                      <button onClick={() => setF('stages', form.stages.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label><span className="block text-[11px] text-gray-500 mb-0.5">Responsable</span>
                        <select value={s.assigneeId} onChange={e => upd({ assigneeId: e.target.value })} className={inp}>
                          <option value="">— Sin asignar —</option>
                          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}{emp.position ? ` · ${emp.position}` : ''}</option>)}
                        </select>
                      </label>
                      <label><span className="block text-[11px] text-gray-500 mb-0.5">Acción</span>
                        <select value={s.kind} onChange={e => upd({ kind: e.target.value as 'vb' | 'fields' })} className={inp}>
                          <option value="vb">Visto bueno (aprobar)</option>
                          <option value="fields">Ingresar campos</option>
                        </select>
                      </label>
                    </div>
                    {s.kind === 'fields' && (
                      <label className="block"><span className="block text-[11px] text-gray-500 mb-0.5">Merge tags a completar (separados por coma, tal cual en la plantilla)</span>
                        <input value={s.tagsText} onChange={e => upd({ tagsText: e.target.value })} className={`${inp} font-mono`} placeholder="Ej. GPA, Grade 1, Course name 1" />
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* SimpleCert */}
        <div>
          <label className="text-xs font-semibold text-gray-600">SimpleCert · Project ID</label>
          <p className="text-[11px] text-gray-400 mb-1">ID del <strong>Project</strong> (plantilla) en SimpleCert que genera el PDF de este documento.</p>
          <input value={form.simplecert_project_id} onChange={e => setF('simplecert_project_id', e.target.value)} className={inp} placeholder="Ej. 123456" />
        </div>

        {/* Imagen de ejemplo (vista previa para el estudiante) */}
        <div>
          <label className="text-xs font-semibold text-gray-600">Imagen de ejemplo (JPG/PNG)</label>
          <p className="text-[11px] text-gray-400 mb-1.5">Vista previa que verá el estudiante en el portal antes de solicitar el documento.</p>
          {form.sample_image_url ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.sample_image_url} alt="Ejemplo" className="w-32 h-auto rounded-lg border border-gray-200" />
              <div className="flex flex-col gap-1.5">
                <a href={form.sample_image_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800">Ver en tamaño completo</a>
                <button onClick={() => setF('sample_image_url', '')} className="text-xs text-red-500 hover:text-red-700 text-left">Quitar imagen</button>
              </div>
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer text-gray-600">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {uploading ? 'Subiendo…' : 'Subir imagen'}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadSample(f); e.target.value = '' }} />
            </label>
          )}
        </div>

        {/* Mapeo de merge tags */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-600">Mapeo de campos (merge tags) <span className="text-gray-400 font-normal">SimpleCert → dato del ERP</span></label>
            <button onClick={() => setF('field_map', [...form.field_map, { tag: '', source: 'first_name', value: '' }])} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Agregar</button>
          </div>
          <p className="text-[11px] text-gray-400 mb-1.5">
            Escribe el nombre del merge tag <strong>tal cual está en tu plantilla</strong> (ej. <code>COD_MAT</code>, <code>HOURS</code>, <code>DATE</code>) y elige con qué dato se llena.
            <code>FIRST_NAME</code>, <code>LAST_NAME</code> y <code>EMAIL_ADDRESS</code> se envían siempre automáticamente.
          </p>
          {form.field_map.length === 0 ? <p className="text-xs text-gray-400">Sin mapeo (solo se envían los campos estándar).</p> : (
            <div className="space-y-2">
              {form.field_map.map((m, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={m.tag} onChange={e => { const mm = [...form.field_map]; mm[i] = { ...mm[i], tag: e.target.value }; setF('field_map', mm) }} className={`${inp} w-40 font-mono`} placeholder="MERGE_TAG" />
                  <span className="text-gray-300">→</span>
                  <select value={m.source} onChange={e => { const mm = [...form.field_map]; mm[i] = { ...mm[i], source: e.target.value }; setF('field_map', mm) }} className={`${inp} w-60`}>
                    {MAP_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  {m.source === 'literal' && <input value={m.value} onChange={e => { const mm = [...form.field_map]; mm[i] = { ...mm[i], value: e.target.value }; setF('field_map', mm) }} className={inp} placeholder="Texto fijo" />}
                  <button onClick={() => setF('field_map', form.field_map.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
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
                    <span className={t.simplecert_project_id ? 'text-green-600' : 'text-amber-600'}>{t.simplecert_project_id ? 'SimpleCert ✓' : 'Sin SimpleCert'}</span>
                    <span className="text-gray-500">{(t.scope_program_ids ?? []).length > 0 ? `${t.scope_program_ids.length} programa(s)` : t.scope_category_id ? (categories.find(c => c.id === t.scope_category_id)?.name ?? 'Categoría') : 'Todos los programas'}</span>
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
