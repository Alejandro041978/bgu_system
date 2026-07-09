'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Loader2, Users, BookOpen, ChevronRight } from 'lucide-react'

interface Ref { id: string; name: string; semesters?: { id: string; name: string }[]; category_id?: string | null }
interface Group { id: string; name: string; semester_id: string; semester_name: string; program_id: string | null; offerings_count: number; students_count: number }

export function GroupsManager() {
  const [categories, setCategories] = useState<Ref[]>([])
  const [years, setYears] = useState<Ref[]>([])
  const [programs, setPrograms] = useState<Ref[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [yearId, setYearId] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', semester_id: '', program_id: '' })
  const [creating, setCreating] = useState(false)

  const loadCatalogs = useCallback(async () => {
    const d = await fetch('/api/academic/groups').then(r => r.json())
    setCategories(d.categories ?? []); setYears(d.years ?? []); setPrograms(d.programs ?? [])
  }, [])
  useEffect(() => { loadCatalogs() }, [loadCatalogs])

  const load = useCallback(async (cat: string, yr: string) => {
    if (!cat || !yr) { setGroups([]); return }
    setLoading(true)
    const d = await fetch(`/api/academic/groups?category_id=${cat}&year_id=${yr}`).then(r => r.json())
    setGroups(d.groups ?? []); setLoading(false)
  }, [])
  useEffect(() => { load(categoryId, yearId) }, [categoryId, yearId, load])

  const yearSemesters = years.find(y => y.id === yearId)?.semesters ?? []
  const catPrograms = programs.filter(p => !categoryId || p.category_id === categoryId)

  async function create() {
    if (!form.name.trim() || !form.semester_id) return
    setCreating(true)
    await fetch('/api/academic/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, category_id: categoryId }),
    })
    setCreating(false); setForm({ name: '', semester_id: '', program_id: '' })
    load(categoryId, yearId)
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
        <p className="text-sm text-gray-400 py-10 text-center">Selecciona categoría y año académico para ver los grupos.</p>
      ) : (
        <>
          {/* Crear grupo */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Nuevo grupo</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex-1 min-w-[180px]">
                <span className="block text-xs text-gray-500 mb-1">Nombre</span>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} placeholder="Ej. Grupo A – Marketing" />
              </label>
              <label className="flex-1 min-w-[160px]">
                <span className="block text-xs text-gray-500 mb-1">Semestre</span>
                <select value={form.semester_id} onChange={e => setForm(f => ({ ...f, semester_id: e.target.value }))} className={inp}>
                  <option value="">Seleccionar…</option>
                  {yearSemesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="flex-1 min-w-[160px]">
                <span className="block text-xs text-gray-500 mb-1">Programa (opcional)</span>
                <select value={form.program_id} onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))} className={inp}>
                  <option value="">—</option>
                  {catPrograms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <button onClick={create} disabled={creating || !form.name.trim() || !form.semester_id}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Crear
              </button>
            </div>
          </div>

          {/* Lista */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">No hay grupos para esta categoría y año.</p>
          ) : (
            <div className="grid gap-3">
              {groups.map(g => (
                <Link key={g.id} href={`/academic/groups/${g.id}`}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{g.name}</p>
                    <p className="text-xs text-gray-400">{g.semester_name}</p>
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
