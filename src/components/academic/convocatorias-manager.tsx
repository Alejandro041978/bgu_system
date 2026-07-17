'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Save, Loader2, CalendarDays, X } from 'lucide-react'

interface Ref { id: string; name: string }
interface EntryGroup { id: string; program_id: string; label: string }
interface Conv {
  id: string; name: string
  deadline_date: string | null; first_day: string | null
  group_ids: string[]
}
interface Sem { id: string; name: string; start_date: string | null; end_date: string | null; convocatorias: Conv[] }

export function ConvocatoriasManager() {
  const [categories, setCategories] = useState<Ref[]>([])
  const [years, setYears] = useState<Ref[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [yearId, setYearId] = useState('')
  const [semesters, setSemesters] = useState<Sem[]>([])
  const [entryGroups, setEntryGroups] = useState<EntryGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadCatalogs = useCallback(async () => {
    const d = await fetch('/api/convocatorias').then(r => r.json())
    setCategories(d.categories ?? []); setYears(d.years ?? [])
  }, [])
  useEffect(() => { loadCatalogs() }, [loadCatalogs])

  const loadData = useCallback(async (cat: string, yr: string) => {
    if (!cat || !yr) { setSemesters([]); return }
    setLoading(true)
    const d = await fetch(`/api/convocatorias?category_id=${cat}&year_id=${yr}`).then(r => r.json())
    setSemesters(d.semesters ?? []); setEntryGroups(d.entry_groups ?? []); setLoading(false)
  }, [])

  useEffect(() => { loadData(categoryId, yearId) }, [categoryId, yearId, loadData])

  function editConv(semId: string, convId: string, field: keyof Conv, value: string) {
    setSemesters(prev => prev.map(s => s.id !== semId ? s : {
      ...s, convocatorias: s.convocatorias.map(c => c.id === convId ? { ...c, [field]: value } : c),
    }))
  }

  async function saveConv(c: Conv) {
    setSavingId(c.id)
    await fetch('/api/convocatorias', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
    })
    setSavingId(null)
  }

  async function addConv(semId: string) {
    await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ academic_semester_id: semId, category_id: categoryId }),
    })
    loadData(categoryId, yearId)
  }

  async function delConv(id: string) {
    if (!confirm('¿Eliminar esta convocatoria?')) return
    const d = await fetch(`/api/convocatorias?id=${id}`, { method: 'DELETE' }).then(r => r.json())
    if (d.error) { alert(d.error); return }
    loadData(categoryId, yearId)
  }

  async function linkGroup(convId: string, groupId: string) {
    if (!groupId) return
    const d = await fetch('/api/convocatorias/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ convocatoria_id: convId, group_id: groupId }),
    }).then(r => r.json())
    if (d.error) { alert(d.error); return }
    loadData(categoryId, yearId)
  }
  async function unlinkGroup(convId: string, groupId: string) {
    await fetch(`/api/convocatorias/groups?convocatoria_id=${convId}&group_id=${groupId}`, { method: 'DELETE' })
    loadData(categoryId, yearId)
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs text-gray-500 mb-1">Categoría</span>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inp}>
            <option value="">Seleccionar…</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs text-gray-500 mb-1">Año académico</span>
          <select value={yearId} onChange={e => setYearId(e.target.value)} className={inp}>
            <option value="">Seleccionar…</option>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </label>
      </div>

      {!categoryId || !yearId ? (
        <p className="text-sm text-gray-400 py-10 text-center">Selecciona categoría y año académico para ver las convocatorias.</p>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : semesters.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">No hay semestres para ese año.</p>
      ) : (
        <div className="space-y-4">
          {semesters.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <CalendarDays className="w-4 h-4 text-gray-400" />{s.name}
                  <span className="text-xs font-normal text-gray-400">{s.start_date} → {s.end_date}</span>
                </div>
                <button onClick={() => addConv(s.id)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              </div>
              {s.convocatorias.length === 0 ? (
                <p className="text-xs text-gray-400 px-4 py-4">Sin convocatorias en este semestre.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead>
                      <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                        <th className="text-left px-3 py-2">Nombre</th>
                        <th className="text-left px-3 py-2">Cierre matrícula</th>
                        <th className="text-left px-3 py-2">Primer día</th>
                        <th className="text-left px-3 py-2">Carruseles de entrada</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.convocatorias.map(c => (
                        <tr key={c.id} className="border-t border-gray-50">
                          <td className="px-3 py-1.5"><input value={c.name ?? ''} onChange={e => editConv(s.id, c.id, 'name', e.target.value)} className={`${inp} min-w-[220px]`} /></td>
                          <td className="px-3 py-1.5"><input type="date" value={c.deadline_date ?? ''} onChange={e => editConv(s.id, c.id, 'deadline_date', e.target.value)} className={inp} /></td>
                          <td className="px-3 py-1.5"><input type="date" value={c.first_day ?? ''} onChange={e => editConv(s.id, c.id, 'first_day', e.target.value)} className={inp} /></td>
                          <td className="px-3 py-1.5">
                            <div className="flex flex-wrap items-center gap-1 max-w-md">
                              {(c.group_ids ?? []).map(gid => {
                                const g = entryGroups.find(x => x.id === gid)
                                return (
                                  <span key={gid} className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full whitespace-normal">
                                    {g?.label ?? gid}
                                    <button onClick={() => unlinkGroup(c.id, gid)} className="text-blue-300 hover:text-red-600" title="Desvincular"><X className="w-3 h-3" /></button>
                                  </span>
                                )
                              })}
                              <select value="" onChange={e => linkGroup(c.id, e.target.value)}
                                className="border border-dashed border-gray-300 rounded-full px-2 py-0.5 text-[11px] text-gray-500 focus:outline-none max-w-[220px]">
                                <option value="">+ vincular carrusel…</option>
                                {entryGroups.filter(g => !(c.group_ids ?? []).includes(g.id)).map(g =>
                                  <option key={g.id} value={g.id}>{g.label}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => saveConv(c)} disabled={savingId === c.id} className="text-gray-400 hover:text-blue-600 mr-3" title="Guardar">
                              {savingId === c.id ? <Loader2 className="w-4 h-4 inline animate-spin" /> : <Save className="w-4 h-4 inline" />}
                            </button>
                            <button onClick={() => delConv(c.id)} className="text-gray-400 hover:text-red-600" title="Eliminar"><Trash2 className="w-4 h-4 inline" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inp = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
