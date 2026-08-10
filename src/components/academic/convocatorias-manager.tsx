'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Save, Loader2, CalendarDays, Layers, X } from 'lucide-react'

interface Ref { id: string; name: string }
interface Conv {
  id: string; name: string
  deadline_date: string | null; first_day: string | null
}
interface Sem { id: string; name: string; start_date: string | null; end_date: string | null; convocatorias: Conv[] }

// El par que la convocatoria declara por programa: el carrusel dice QUÉ se
// cursa y en qué orden; la colección, EN QUÉ AULA de cada asignatura entra el
// estudiante (regular, upgrade, campus socio, inglés).
interface Coleccion { id: string; name: string; language: string | null; partner: string | null; active: boolean; casillas: number }
interface Carrusel { id: string; abbreviation: string | null; name: string | null; es_entrada: boolean }
interface ProgramaSetup {
  id: string; name: string; partner_campus: boolean; malla: number
  colecciones: Coleccion[]; carruseles: Carrusel[]
  setup: { collection_id: string | null; group_id: string | null }
}

export function ConvocatoriasManager() {
  const [categories, setCategories] = useState<Ref[]>([])
  const [years, setYears] = useState<Ref[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [yearId, setYearId] = useState('')
  const [semesters, setSemesters] = useState<Sem[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [setupOf, setSetupOf] = useState<Conv | null>(null)
  const [setupRows, setSetupRows] = useState<ProgramaSetup[] | null>(null)
  const [setupSaving, setSetupSaving] = useState<string | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)

  const loadCatalogs = useCallback(async () => {
    const d = await fetch('/api/convocatorias').then(r => r.json())
    setCategories(d.categories ?? []); setYears(d.years ?? [])
  }, [])
  useEffect(() => { loadCatalogs() }, [loadCatalogs])

  const loadData = useCallback(async (cat: string, yr: string) => {
    if (!cat || !yr) { setSemesters([]); return }
    setLoading(true)
    const d = await fetch(`/api/convocatorias?category_id=${cat}&year_id=${yr}`).then(r => r.json())
    setSemesters(d.semesters ?? []); setLoading(false)
  }, [])

  useEffect(() => { loadData(categoryId, yearId) }, [categoryId, yearId, loadData])

  function editConv(semId: string, convId: string, field: keyof Conv, value: string) {
    setSemesters(prev => prev.map(s => s.id !== semId ? s : {
      ...s, convocatorias: s.convocatorias.map(c => c.id === convId ? { ...c, [field]: value } : c),
    }))
  }

  async function saveConv(c: Conv) {
    setSavingId(c.id)
    const d = await fetch('/api/convocatorias', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setSavingId(null)
    if (d.error) {
      alert(d.error)
      loadData(categoryId, yearId) // revierte la fila al valor guardado
    }
  }

  async function addConv(semId: string) {
    await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ academic_semester_id: semId, category_id: categoryId }),
    })
    loadData(categoryId, yearId)
  }

  async function openSetup(c: Conv) {
    setSetupOf(c); setSetupRows(null); setSetupError(null)
    const d = await fetch(`/api/convocatorias/setup?convocatoria_id=${c.id}`).then(r => r.json())
      .catch(() => ({ error: 'Error de red' }))
    if (d.error) { setSetupError(d.error); setSetupRows([]); return }
    setSetupRows(d.programas ?? [])
  }

  // Se guarda por programa, al cambiar el select. Un botón "Guardar todo" en
  // una tabla de veinte programas invita a perder lo elegido al cerrar.
  async function saveSetup(p: ProgramaSetup, campo: 'collection_id' | 'group_id', valor: string) {
    if (!setupOf) return
    const nuevo = { ...p.setup, [campo]: valor || null }
    setSetupRows(prev => (prev ?? []).map(x => x.id === p.id ? { ...x, setup: nuevo } : x))
    setSetupSaving(p.id); setSetupError(null)
    const d = await fetch('/api/convocatorias/setup', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ convocatoria_id: setupOf.id, program_id: p.id, ...nuevo }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setSetupSaving(null)
    if (d.error) { setSetupError(d.error); openSetup(setupOf) }
  }

  async function delConv(id: string) {
    if (!confirm('¿Eliminar esta convocatoria?')) return
    const d = await fetch(`/api/convocatorias?id=${id}`, { method: 'DELETE' }).then(r => r.json())
    if (d.error) { alert(d.error); return }
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
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.convocatorias.map(c => (
                        <tr key={c.id} className="border-t border-gray-50">
                          <td className="px-3 py-1.5"><input value={c.name ?? ''} onChange={e => editConv(s.id, c.id, 'name', e.target.value)} className={`${inp} min-w-[220px]`} /></td>
                          <td className="px-3 py-1.5"><input type="date" value={c.deadline_date ?? ''} onChange={e => editConv(s.id, c.id, 'deadline_date', e.target.value)} className={inp} /></td>
                          <td className="px-3 py-1.5"><input type="date" value={c.first_day ?? ''} onChange={e => editConv(s.id, c.id, 'first_day', e.target.value)} className={inp} /></td>
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => openSetup(c)} className="text-gray-400 hover:text-violet-600 mr-3" title="Colección de aulas y carrusel por programa">
                              <Layers className="w-4 h-4 inline" />
                            </button>
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

      {setupOf && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-start justify-center p-4 overflow-auto" onClick={() => setSetupOf(null)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl mt-10 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Colección y carrusel · {setupOf.name}</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                  El <strong>carrusel</strong> define qué asignaturas se cursan y en qué orden. La <strong>colección</strong> define
                  en cuál de las aulas de cada asignatura entra el estudiante (la regular, la del upgrade, la del campus socio,
                  la que se dicta en inglés). Quien se matricule por esta convocatoria hereda el par de su programa.
                </p>
              </div>
              <button onClick={() => setSetupOf(null)} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
            </div>

            {setupError && <p className="text-sm text-red-600 px-5 py-3">{setupError}</p>}

            {setupRows === null ? (
              <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : setupRows.length === 0 ? (
              <p className="text-sm text-gray-400 px-5 py-10 text-center">Esta convocatoria no tiene programas en su categoría.</p>
            ) : (
              <div className="overflow-x-auto max-h-[65vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="text-left px-4 py-2">Programa</th>
                      <th className="text-left px-4 py-2">Colección de aulas</th>
                      <th className="text-left px-4 py-2">Carrusel de entrada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setupRows.map(p => (
                      <tr key={p.id} className="border-t border-gray-50 align-top">
                        <td className="px-4 py-2">
                          <span className="text-gray-800">{p.name}</span>
                          {setupSaving === p.id && <Loader2 className="w-3 h-3 inline ml-2 animate-spin text-gray-400" />}
                          {p.partner_campus && <span className="block text-[11px] text-gray-400">campus externo — no usa nuestro Moodle</span>}
                        </td>
                        <td className="px-4 py-2">
                          {p.partner_campus ? <span className="text-xs text-gray-400">No corresponde</span> : (
                            <>
                              <select value={p.setup.collection_id ?? ''} onChange={e => saveSetup(p, 'collection_id', e.target.value)}
                                className={inp} disabled={!p.colecciones.length}>
                                <option value="">{p.colecciones.length ? 'Sin definir' : 'El programa no tiene colecciones'}</option>
                                {p.colecciones.map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}{c.partner ? ` · ${c.partner}` : ''}{c.language ? ` · ${c.language}` : ''} — {c.casillas} de {p.malla} aulas
                                  </option>
                                ))}
                              </select>
                              {/* Una colección a medio armar se puede atar igual: el vínculo ya
                                  existe y el cron diario incorpora las aulas que se añadan. Lo que
                                  no sirve es que no exista ninguna. */}
                              {(() => {
                                const c = p.colecciones.find(x => x.id === p.setup.collection_id)
                                if (!c || !p.malla || c.casillas >= p.malla) return null
                                return <span className="block text-[11px] text-amber-700 mt-1">Colección incompleta: le faltan {p.malla - c.casillas} aulas por colocar</span>
                              })()}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <select value={p.setup.group_id ?? ''} onChange={e => saveSetup(p, 'group_id', e.target.value)}
                            className={inp} disabled={!p.carruseles.length}>
                            <option value="">{p.carruseles.length ? 'Sin definir — se coloca después' : 'El programa no tiene carruseles'}</option>
                            {p.carruseles.map(g => (
                              <option key={g.id} value={g.id}>
                                {g.abbreviation ? g.abbreviation + ' · ' : ''}{g.name}{g.es_entrada ? ' (entrada)' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-gray-400 px-5 py-3 border-t border-gray-100">
              Cada cambio se guarda al elegirlo. Solo afecta a las matrículas que se hagan de aquí en adelante.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

const inp = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
