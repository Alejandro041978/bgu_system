'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Search, AlertTriangle, CheckCircle2, Link2 } from 'lucide-react'

interface Cat { id: string; name: string }
interface Prog { id: string; name: string; category_id: string | null }
interface Course {
  id: string; code: string | null; name: string; credits: number | null
  aulas: number[]; ultima_sincronizacion: string | null; aulas_sin_auditar: number[]
}
interface Resultado {
  aula: number; estado: string; detalle?: string
  nuevas?: number; actualizadas?: number; sin_cambio?: number; protegidas?: number; cerradas?: number
}

const fecha = (d: string | null) => {
  if (!d) return 'nunca'
  const t = new Date(d)
  const horas = Math.round((Date.now() - t.getTime()) / 3600000)
  if (horas < 1) return 'hace menos de una hora'
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.round(horas / 24)} d`
}

export function CourseSyncView() {
  const [cats, setCats] = useState<Cat[]>([])
  const [progs, setProgs] = useState<Prog[]>([])
  const [catId, setCatId] = useState('')
  const [progId, setProgId] = useState('')
  const [q, setQ] = useState('')
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [corriendo, setCorriendo] = useState<string | null>(null)
  const [salida, setSalida] = useState<Record<string, { nuevas: number; actualizadas: number; resultados: Resultado[] }>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/academic/course-sync').then(r => r.json())
      .then(d => { setCats(d.categories ?? []); setProgs(d.programs ?? []) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!progId) { setCourses(null); return }
    setCourses(null)
    fetch(`/api/academic/course-sync?program_id=${progId}`).then(r => r.json())
      .then(d => setCourses(d.courses ?? [])).catch(() => setCourses([]))
  }, [progId])

  async function sincronizar(c: Course) {
    setCorriendo(c.id); setError(null)
    const d = await fetch('/api/academic/course-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_id: c.id }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setCorriendo(null)
    if (d.error) { setError(d.error); return }
    setSalida(p => ({ ...p, [c.id]: { nuevas: d.nuevas, actualizadas: d.actualizadas, resultados: d.resultados ?? [] } }))
    // Se recarga la lista: cambia la última sincronización de la asignatura.
    fetch(`/api/academic/course-sync?program_id=${progId}`).then(r => r.json())
      .then(x => setCourses(x.courses ?? [])).catch(() => {})
  }

  const progsDeCat = catId ? progs.filter(p => p.category_id === catId) : progs
  const filtradas = (courses ?? []).filter(c => {
    const t = q.trim().toLowerCase()
    return !t || c.name.toLowerCase().includes(t) || (c.code ?? '').toLowerCase().includes(t)
  })
  const sel = 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select value={catId} onChange={e => { setCatId(e.target.value); setProgId('') }} className={`${sel} min-w-56`}>
          <option value="">Todas las categorías</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={progId} onChange={e => setProgId(e.target.value)} className={`${sel} flex-1 min-w-64`}>
          <option value="">Elige un programa…</option>
          {progsDeCat.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {progId && (
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar asignatura…"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm" />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {!progId ? (
        <p className="text-sm text-gray-400 py-12 text-center">
          Elige un programa para ver sus asignaturas y sincronizar la que necesites.
        </p>
      ) : courses === null ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtradas.map(c => {
            const out = salida[c.id]
            return (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 font-mono w-16 shrink-0">{c.code ?? '—'}</span>
                  <span className="text-sm text-gray-800 flex-1">{c.name}</span>

                  {c.aulas.length === 0 ? (
                    <span className="text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">Sin aulas vinculadas</span>
                  ) : (
                    <span className="text-[11px] text-gray-500 inline-flex items-center gap-1" title={`Aulas: ${c.aulas.join(', ')}`}>
                      <Link2 className="w-3 h-3" />{c.aulas.length} aula{c.aulas.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {/* Un aula sin ponderaciones auditadas la rechaza el importador
                      entera. Decirlo antes evita pulsar y esperar para nada. */}
                  {c.aulas_sin_auditar.length > 0 && (
                    <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                      title={`Sin auditoría de ponderaciones: ${c.aulas_sin_auditar.join(', ')}. El importador las rechaza — pasa antes el Auditor de campus.`}>
                      <AlertTriangle className="w-3 h-3" />{c.aulas_sin_auditar.length} sin auditar
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400 w-32 text-right">{fecha(c.ultima_sincronizacion)}</span>

                  <button onClick={() => sincronizar(c)} disabled={corriendo !== null || c.aulas.length === 0}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shrink-0">
                    {corriendo === c.id
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sincronizando…</>
                      : <><RefreshCw className="w-3.5 h-3.5" /> Sincronizar</>}
                  </button>
                </div>

                {out && (
                  <div className="mt-2 ml-16 text-xs space-y-1">
                    <p className="text-gray-600 inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      {out.nuevas} nota(s) nueva(s) · {out.actualizadas} actualizada(s)
                    </p>
                    {out.resultados.map(r => (
                      <p key={r.aula} className={r.estado === 'importada' ? 'text-gray-400' : 'text-amber-700'}>
                        Aula {r.aula}: {r.estado === 'importada'
                          ? `${r.nuevas} nuevas, ${r.actualizadas} actualizadas, ${r.sin_cambio} sin cambio${r.protegidas ? `, ${r.protegidas} protegidas` : ''}${r.cerradas ? `, ${r.cerradas} cerradas` : ''}`
                          : `${r.estado} — ${r.detalle}`}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {filtradas.length === 0 && <p className="text-sm text-gray-400 px-4 py-6">Sin asignaturas que coincidan.</p>}
        </div>
      )}
    </div>
  )
}
