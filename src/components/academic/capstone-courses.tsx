'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Search, Check, Plus } from 'lucide-react'

interface Curso { id: string; name: string; code: string | null; programa: string; is_capstone: boolean }

// El selector de alcance. Solo lo ve el superadministrador: marcar una
// asignatura aquí decide sobre qué puede editar el colaborador de capstone, y
// quien define el alcance no debería ser quien trabaja dentro de él.
export function CapstoneCourses() {
  const [marcadas, setMarcadas] = useState<Curso[]>([])
  const [encontradas, setEncontradas] = useState<Curso[]>([])
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargar = useCallback(async (busqueda: string) => {
    const r = await fetch(`/api/academic/capstone-courses?q=${encodeURIComponent(busqueda)}`)
    const d = await r.json().catch(() => null)
    setCargando(false)
    if (!r.ok || !d || d.error) return
    setMarcadas(d.marcadas ?? [])
    setEncontradas(d.encontradas ?? [])
  }, [])

  useEffect(() => { cargar('') }, [cargar])

  function buscar(v: string) {
    setQ(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => cargar(v), 350)
  }

  async function marcar(c: Curso, valor: boolean) {
    setBusy(c.id); setAviso(null)
    const r = await fetch('/api/academic/capstone-courses', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_id: c.id, is_capstone: valor }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setAviso(d.error ?? 'No se pudo guardar'); return }
    setAviso(valor
      ? `"${c.name}" es capstone.${d.aulas_desconectadas ? ` Se apagó la sincronización de ${d.aulas_desconectadas} aula(s): siguen dando acceso, ya no traen notas.` : ''}`
      : `"${c.name}" deja de ser capstone. La sincronización de sus aulas NO se reanuda sola; si debe volver a importar, enciéndela en Vinculación de Aulas.`)
    cargar(q)
  }

  if (cargando) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>

  const yaMarcadas = new Set(marcadas.map(c => c.id))

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm text-gray-600 leading-relaxed">
          Una asignatura marcada aquí se evalúa por defensa, no en el aula. Su aula de Moodle sigue
          existiendo y el estudiante sigue entrando —acompaña, orienta, recibe la entrega— pero deja de
          traer calificaciones: la nota se registra abajo.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          La marca es explícita a propósito. Buscar la palabra &quot;capstone&quot; en el título habría
          bastado hoy, y habría fallado en silencio el día que alguien cree &quot;Trabajo Final&quot;.
        </p>
      </div>

      {aviso && <p className="text-sm text-blue-800 bg-blue-50 px-4 py-2.5 rounded-xl">{aviso}</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Asignaturas capstone · {marcadas.length}</p>
        </div>
        <div className="divide-y divide-gray-50">
          {marcadas.map(c => (
            <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-800 truncate">{c.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{c.programa}</p>
              </div>
              <button onClick={() => marcar(c, false)} disabled={busy === c.id}
                className="shrink-0 text-xs font-medium text-gray-400 hover:text-rose-600 disabled:opacity-40">
                {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Quitar'}
              </button>
            </div>
          ))}
          {!marcadas.length && <p className="px-4 py-6 text-center text-sm text-gray-400">Ninguna marcada todavía.</p>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={q} onChange={e => buscar(e.target.value)}
              placeholder="Buscar una asignatura para marcarla"
              className="flex-1 px-2 py-1.5 text-sm bg-transparent focus:outline-none" />
          </div>
        </div>
        <div className="divide-y divide-gray-50 max-h-80 overflow-auto">
          {encontradas.map(c => (
            <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-800 truncate">{c.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{c.programa}</p>
              </div>
              {yaMarcadas.has(c.id) ? (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-green-600"><Check className="w-3.5 h-3.5" /> ya marcada</span>
              ) : (
                <button onClick={() => marcar(c, true)} disabled={busy === c.id}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40">
                  {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Marcar
                </button>
              )}
            </div>
          ))}
          {q.trim().length >= 2 && !encontradas.length && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Ninguna asignatura coincide.</p>
          )}
          {q.trim().length < 2 && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Escribe al menos dos letras.</p>
          )}
        </div>
      </div>
    </div>
  )
}
