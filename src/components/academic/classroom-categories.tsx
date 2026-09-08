'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, EyeOff, Eye } from 'lucide-react'

// ---------------------------------------------------------------------------
// Categorías del campus — qué ramas entran al servicio educativo.
//
// El campus tiene categorías que no son enseñanza (Demo Acreditación,
// Capacitaciones internas, Aulas de Inducción). Excluir una rama saca a todas
// sus aulas de las propuestas de vinculación, de Aulas libres y de los
// contadores — por prefijo: excluir "Excluidos ERP" cubre todo lo que cuelga.
// ---------------------------------------------------------------------------
interface Nodo {
  path: string; depth: number; aulas: number; alumnos: number; vinculadas: number
  excluida: boolean; excluida_por: string | null
}

export function ClassroomCategories() {
  const [data, setData] = useState<{ total_aulas: number; excluidas: number; categorias: Nodo[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch('/api/academic/moodle-links?vista=categorias').then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    if (d.error) { setError(d.error); return }
    setData(d); setError(null)
  }, [])
  useEffect(() => { load() }, [load])

  async function toggle(n: Nodo) {
    if (!n.excluida && n.vinculadas > 0 && !confirm(
      `"${n.path}" tiene ${n.vinculadas} aula(s) VINCULADAS a asignaturas.\n\n` +
      `Excluir la rama las saca de las propuestas y contadores, pero NO toca sus vínculos ni su sincronización — revísalas aparte si corresponde.\n\n¿Excluir igual?`)) return
    setBusy(n.path); setError(null)
    const d = await fetch('/api/academic/moodle-links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n.excluida ? { incluir_categoria: n.path } : { excluir_categoria: n.path }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setBusy(null)
    if (d.error) { setError(d.error); return }
    load()
  }

  if (error && !data) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
  if (!data) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span><b>{data.total_aulas}</b> aulas en el campus</span>
        <span>·</span>
        <span><b className={data.excluidas ? 'text-slate-900' : ''}>{data.excluidas}</b> fuera del servicio educativo</span>
        {error && <span className="text-red-600">{error}</span>}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2">Categoría</th>
              <th className="text-right px-4 py-2">Aulas</th>
              <th className="text-right px-4 py-2">Alumnos</th>
              <th className="text-right px-4 py-2">Vinculadas</th>
              <th className="text-left px-4 py-2">Servicio educativo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.categorias.map(n => {
              const fuera = n.excluida || !!n.excluida_por
              return (
                <tr key={n.path} className={fuera ? 'bg-gray-50/60 text-gray-400' : ''}>
                  <td className="px-4 py-1.5" style={{ paddingLeft: `${16 + n.depth * 18}px` }}>
                    <span className={fuera ? '' : 'text-gray-800'}>{n.path.split(' / ').pop()}</span>
                    {n.excluida_por && <span className="ml-2 text-[10px] text-gray-400">excluida por «{n.excluida_por}»</span>}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{n.aulas}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{n.alumnos}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{n.vinculadas || '—'}</td>
                  <td className="px-4 py-1.5">
                    {n.excluida_por ? (
                      <span className="text-[11px]">heredado</span>
                    ) : (
                      <button onClick={() => toggle(n)} disabled={busy === n.path}
                        className={`inline-flex items-center gap-1 text-[11px] font-medium rounded px-1.5 py-0.5 disabled:opacity-40 ${
                          n.excluida ? 'text-gray-500 hover:bg-gray-100' : 'text-green-700 hover:bg-green-50'}`}>
                        {busy === n.path ? <Loader2 className="w-3 h-3 animate-spin" />
                          : n.excluida ? <><EyeOff className="w-3 h-3" /> excluida — incluir</>
                          : <><Eye className="w-3 h-3" /> incluida — excluir</>}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">
        La exclusión es por rama (prefijo): excluir una categoría cubre todo lo que cuelga de ella. No toca vínculos ni
        sincronización existentes — solo saca sus aulas de las propuestas, de Aulas libres y de los contadores. Para un
        aula suelta mal ubicada (una inducción dentro de una categoría académica), usa la marca «no curricular» en
        Vincular aulas, o muévela de categoría en Moodle.
      </p>
    </div>
  )
}
