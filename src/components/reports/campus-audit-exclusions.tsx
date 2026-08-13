'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, EyeOff, Undo2 } from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'

// `aulas` incluye las subcategorías —es lo que de verdad se excluye—;
// `propias` son solo las que cuelgan directamente de la categoría.
interface Categoria { ruta: string; aulas: number; propias: number; excluida: boolean }
interface Exclusion { ruta: string; nota: string | null; aulas?: number }
interface Data { exclusiones: Exclusion[]; categorias: Categoria[]; aulas_excluidas: number }

// Qué categorías de Moodle no mide el auditor.
//
// Las categorías se ELIGEN de las que existen en la foto, no se escriben: una
// ruta mal tecleada no excluye nada y no avisa de que no excluyó nada.
export function CampusAuditExclusions() {
  const { superadmin } = usePermissions()
  const [d, setD] = useState<Data | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [sel, setSel] = useState('')
  const [nota, setNota] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/academic/moodle-audit/exclusions')
    const j = await r.json().catch(() => null)
    if (r.ok && j) setD(j)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function excluir() {
    if (!sel) { setError('Elige una categoría.'); return }
    if (!nota.trim()) { setError('Escribe por qué se excluye.'); return }
    setBusy(sel); setError(null); setAviso(null)
    const r = await fetch('/api/academic/moodle-audit/exclusions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruta: sel, nota: nota.trim() }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setError(j.error ?? 'No se pudo guardar'); return }
    setAviso(`"${sel}" queda fuera de la auditoría: ${j.aulas_excluidas} aula(s) dejan de medirse.`)
    setSel(''); setNota('')
    cargar()
  }

  async function quitar(ruta: string) {
    setBusy(ruta); setError(null); setAviso(null)
    const r = await fetch(`/api/academic/moodle-audit/exclusions?ruta=${encodeURIComponent(ruta)}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setError(j.error ?? 'No se pudo quitar'); return }
    setAviso(`"${ruta}" vuelve a auditarse. Sus aulas no tienen foto reciente: audita esa familia para recuperarla.`)
    cargar()
  }

  if (!d) return <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>

  const disponibles = d.categorias.filter(c => !c.excluida && c.ruta !== '(sin categoría)')

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm text-gray-600 leading-relaxed">
          El auditor mide si las ponderaciones suman 100% y si la escala está sobre 100. Eso tiene sentido
          en un aula que enseña. En una que está en construcción, en desuso o es una demo, no mide nada
          —y un incumplimiento que nadie va a arreglar enseña al equipo a no leer la lista.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Excluir una categoría excluye también lo que cuelgue de ella. Las aulas no desaparecen: el
          auditor sigue diciendo cuántas dejó fuera y por qué.
        </p>
      </div>

      {aviso && <p className="text-sm text-blue-800 bg-blue-50 px-4 py-2.5 rounded-xl">{aviso}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">
            Fuera de la auditoría · {d.exclusiones.length} categoría{d.exclusiones.length === 1 ? '' : 's'}
            {d.aulas_excluidas ? ` · ${d.aulas_excluidas} aulas` : ''}
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {d.exclusiones.map(e => {
            // Lo cuenta el servidor con la misma regla de tramos que aplica el
            // auditor. Contarlo aquí con un `includes` sobre los nombres daba
            // otro número que el de la decisión.
            const n = e.aulas ?? 0
            return (
              <div key={e.ruta} className="px-4 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 text-gray-300 shrink-0" />{e.ruta}
                    <span className="text-[11px] text-gray-400">· {n} aula{n === 1 ? '' : 's'}</span>
                  </p>
                  {e.nota && <p className="text-[11px] text-gray-400 mt-0.5 pl-5">{e.nota}</p>}
                </div>
                {superadmin && (
                  <button onClick={() => quitar(e.ruta)} disabled={busy === e.ruta}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-blue-600 disabled:opacity-40">
                    {busy === e.ruta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Volver a auditar
                  </button>
                )}
              </div>
            )
          })}
          {!d.exclusiones.length && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">El auditor está mirando todo el campus.</p>
          )}
        </div>
      </div>

      {superadmin && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Excluir una categoría</p>
          <select value={sel} onChange={e => setSel(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Elige una categoría de Moodle…</option>
            {disponibles.map(c => {
              // Sangrado por profundidad: la lista mezcla madres e hijas, y sin
              // esto "Otros" y "Otros / UNDC / Gestión Pública" se leen como dos
              // opciones sueltas en vez de una rama y su rama.
              const nivel = c.ruta.split(' / ').length - 1
              return (
                <option key={c.ruta} value={c.ruta}>
                  {'  '.repeat(nivel)}{nivel ? '└ ' : ''}{c.ruta.split(' / ').pop()} — {c.aulas} aula{c.aulas === 1 ? '' : 's'}
                  {c.aulas > c.propias ? ` (${c.propias} propia${c.propias === 1 ? '' : 's'} + ${c.aulas - c.propias} en subcategorías)` : ''}
                </option>
              )
            })}
          </select>
          {sel && (() => {
            const c = d.categorias.find(x => x.ruta === sel)
            if (!c) return null
            return (
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <b>{sel}</b><br />
                Dejarán de auditarse <b>{c.aulas} aula{c.aulas === 1 ? '' : 's'}</b>
                {c.propias === 0
                  ? <>, todas en las subcategorías que cuelgan de ella</>
                  : c.aulas > c.propias
                    ? <> — {c.propias} de esta categoría y {c.aulas - c.propias} de las que cuelgan de ella</>
                    : null}.
              </p>
            )
          })()}
          <input value={nota} onChange={e => setNota(e.target.value)}
            placeholder="Por qué no vale: en construcción, en desuso, demo…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-gray-400">
              El motivo queda guardado. Dentro de un año será lo único que explique por qué esas aulas
              no se miden.
            </p>
            <button onClick={excluir} disabled={!!busy}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
              {busy && busy === sel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />} Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
