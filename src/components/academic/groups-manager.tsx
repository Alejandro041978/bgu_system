'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Loader2, Users, BookOpen, ChevronRight } from 'lucide-react'

interface Ref { id: string; name: string; category_id?: string | null }
interface Group { id: string; abbreviation: string | null; name: string | null; detail: string | null; offerings_count: number; students_count: number }

export function GroupsManager() {
  const [categories, setCategories] = useState<Ref[]>([])
  const [programs, setPrograms] = useState<Ref[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [programId, setProgramId] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ abbreviation: '', name: '', detail: '' })
  const [creating, setCreating] = useState(false)

  const loadCatalogs = useCallback(async () => {
    const d = await fetch('/api/academic/groups').then(r => r.json())
    setCategories(d.categories ?? []); setPrograms(d.programs ?? [])
  }, [])
  useEffect(() => { loadCatalogs() }, [loadCatalogs])

  const load = useCallback(async (prog: string) => {
    if (!prog) { setGroups([]); return }
    setLoading(true)
    const d = await fetch(`/api/academic/groups?program_id=${prog}`).then(r => r.json())
    setGroups(d.groups ?? []); setLoading(false)
  }, [])
  useEffect(() => { load(programId) }, [programId, load])

  const catPrograms = programs.filter(p => !categoryId || p.category_id === categoryId)

  async function create() {
    if (!programId || !(form.name.trim() || form.abbreviation.trim())) return
    setCreating(true)
    await fetch('/api/academic/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, program_id: programId, category_id: categoryId }),
    })
    setCreating(false); setForm({ abbreviation: '', name: '', detail: '' })
    load(programId)
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs text-gray-500 mb-1">Categoría</span>
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setProgramId('') }} className={inp}>
            <option value="">Seleccionar…</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs text-gray-500 mb-1">Programa</span>
          <select value={programId} onChange={e => setProgramId(e.target.value)} className={inp} disabled={!categoryId}>
            <option value="">Seleccionar…</option>
            {catPrograms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      {!programId ? (
        <p className="text-sm text-gray-400 py-10 text-center">Selecciona categoría y programa para ver y crear grupos.</p>
      ) : (
        <>
          {/* Crear grupo */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Nuevo grupo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <label>
                <span className="block text-xs text-gray-500 mb-1">Abreviatura</span>
                <input value={form.abbreviation} onChange={e => setForm(f => ({ ...f, abbreviation: e.target.value }))} className={inp} placeholder="Ej. G-A" />
              </label>
              <label>
                <span className="block text-xs text-gray-500 mb-1">Denominación</span>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} placeholder="Ej. Grupo A" />
              </label>
              <label>
                <span className="block text-xs text-gray-500 mb-1">Detalle (opcional)</span>
                <input value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))} className={inp} placeholder="Ej. Turno noche" />
              </label>
              <button onClick={create} disabled={creating || !(form.name.trim() || form.abbreviation.trim())}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Crear
              </button>
            </div>
          </div>

          {/* Lista */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">No hay grupos para este programa.</p>
          ) : (
            <div className="grid gap-3">
              {groups.map(g => (
                <Link key={g.id} href={`/academic/groups/${g.id}`}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {g.abbreviation && <span className="text-blue-600">{g.abbreviation}</span>}{g.abbreviation && g.name ? ' · ' : ''}{g.name}
                    </p>
                    {g.detail && <p className="text-xs text-gray-400">{g.detail}</p>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{g.offerings_count} asignaturas</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{g.students_count} estudiantes</span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
