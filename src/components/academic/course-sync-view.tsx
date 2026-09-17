'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Search, AlertTriangle, CheckCircle2, User, X } from 'lucide-react'

interface Cat { id: string; name: string }
interface Prog { id: string; name: string; category_id: string | null }
// La sincronización manual es POR ASIGNATURA/COLECCIÓN (17/09/2026): el cron ya
// pasa por todas las aulas; quien sincroniza a mano tiene una necesidad con UNA
// colección —o con un alumno—, no con todas las de la asignatura.
interface Coleccion {
  aula: number; coleccion: string | null; shortname: string | null
  matriculados: number | null; ultima: string | null; rechazo: string | null; sync_enabled: boolean
}
interface Course {
  id: string; code: string | null; name: string; credits: number | null
  aulas: number[]; colecciones: Coleccion[]
}
interface Resultado {
  aula: number; estado: string; detalle?: string
  nuevas?: number; actualizadas?: number; sin_cambio?: number; protegidas?: number; cerradas?: number
  sin_puente?: number; sin_total?: number
  parcial?: { consultados: number; total: number; pendientes: number } | null
}
interface Alumno { id: string; nombre: string; documento: string | null }

const fecha = (d: string | null) => {
  if (!d) return 'nunca'
  const horas = Math.round((Date.now() - new Date(d).getTime()) / 3600000)
  if (horas < 1) return 'hace menos de 1 h'
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
  const [salida, setSalida] = useState<Record<string, { r: Resultado; alumno: string | null; duracion: number }>>({})
  const [error, setError] = useState<string | null>(null)
  // Alumno específico (opcional): si se elige, cada botón sincroniza solo a esa persona.
  const [alumno, setAlumno] = useState<Alumno | null>(null)
  const [alumnoQ, setAlumnoQ] = useState('')
  const [alumnoOps, setAlumnoOps] = useState<Alumno[]>([])

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

  useEffect(() => {
    const t = alumnoQ.trim()
    if (t.length < 3) { setAlumnoOps([]); return }
    const h = setTimeout(() => {
      fetch(`/api/academic/course-sync?student_q=${encodeURIComponent(t)}`).then(r => r.json())
        .then(d => setAlumnoOps(d.students ?? [])).catch(() => setAlumnoOps([]))
    }, 300)
    return () => clearTimeout(h)
  }, [alumnoQ])

  async function sincronizar(c: Course, col: Coleccion) {
    const key = `${c.id}:${col.aula}`
    setCorriendo(key); setError(null)
    const d = await fetch('/api/academic/course-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_id: c.id, aula_id: col.aula, ...(alumno ? { student_id: alumno.id } : {}) }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red o la sincronización excedió el tiempo del servidor' }))
    setCorriendo(null)
    if (d.error) { setError(d.error); return }
    setSalida(p => ({ ...p, [key]: { r: d.resultado, alumno: alumno?.nombre ?? null, duracion: d.duracion_s } }))
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

      {/* Alumno específico (opcional) */}
      {progId && (
        <div className="relative">
          {alumno ? (
            <div className="inline-flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2">
              <User className="w-4 h-4" />
              Solo se sincronizará a <b>{alumno.nombre}</b>{alumno.documento ? ` (${alumno.documento})` : ''}
              <button onClick={() => setAlumno(null)} title="Quitar: volver a sincronizar la colección completa"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <>
              <div className="relative max-w-md">
                <User className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={alumnoQ} onChange={e => setAlumnoQ(e.target.value)}
                  placeholder="Opcional: sincronizar solo a un alumno (nombre o documento)…"
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm" />
              </div>
              {alumnoOps.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-lg divide-y divide-gray-50">
                  {alumnoOps.map(a => (
                    <button key={a.id} onClick={() => { setAlumno(a); setAlumnoQ(''); setAlumnoOps([]) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                      {a.nombre} <span className="text-xs text-gray-400">{a.documento ?? ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {!progId ? (
        <p className="text-sm text-gray-400 py-12 text-center">
          Elige un programa para ver sus asignaturas y sincronizar la colección que necesites.
        </p>
      ) : courses === null ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtradas.map(c => (
            <div key={c.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 font-mono w-16 shrink-0">{c.code ?? '—'}</span>
                <span className="text-sm font-medium text-gray-800 flex-1">{c.name}</span>
                {c.colecciones.length === 0 && (
                  <span className="text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">Sin aulas vinculadas</span>
                )}
              </div>

              {/* Un botón por asignatura/colección */}
              {c.colecciones.map(col => {
                const key = `${c.id}:${col.aula}`
                const out = salida[key]
                return (
                  <div key={col.aula} className="ml-16 mt-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-gray-700 truncate">
                          {col.coleccion ?? <span className="text-gray-400">Sin colección</span>}
                          <span className="text-gray-400"> · aula {col.aula}</span>
                        </p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {col.shortname ?? ''}{col.matriculados != null ? ` · ${col.matriculados} matriculados` : ''}
                          {!col.sync_enabled ? ' · sincronización automática apagada' : ''}
                        </p>
                      </div>
                      {/* El importador rechaza entera un aula que no cumple la
                          política. Decirlo antes evita pulsar y esperar para nada. */}
                      {col.rechazo && (
                        <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1 max-w-xs truncate"
                          title={`El importador la rechazará: ${col.rechazo}`}>
                          <AlertTriangle className="w-3 h-3 shrink-0" />no importable
                        </span>
                      )}
                      {!alumno && (col.matriculados ?? 0) > 150 && (
                        <span className="text-[11px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full"
                          title="Aula grande: se consulta estudiante por estudiante. Primero quienes cursan la asignatura; el resto por turnos. Puede tardar varios minutos.">
                          aula grande
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400 w-28 text-right shrink-0">{fecha(col.ultima)}</span>
                      <button onClick={() => sincronizar(c, col)} disabled={corriendo !== null}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shrink-0">
                        {corriendo === key
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sincronizando…</>
                          : <><RefreshCw className="w-3.5 h-3.5" /> {alumno ? 'Sincronizar alumno' : 'Sincronizar'}</>}
                      </button>
                    </div>

                    {out && (
                      <div className="mt-1 text-xs">
                        {out.r.estado === 'importada' ? (
                          <>
                            <p className="text-gray-600 inline-flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                              {out.alumno ? `${out.alumno}: ` : ''}{out.r.nuevas} nueva(s), {out.r.actualizadas} actualizada(s), {out.r.sin_cambio} sin cambio
                              {out.r.protegidas ? `, ${out.r.protegidas} protegidas` : ''}{out.r.cerradas ? `, ${out.r.cerradas} cerradas` : ''}
                              <span className="text-gray-400">· {out.duracion} s</span>
                            </p>
                            {out.alumno && !out.r.nuevas && !out.r.actualizadas && !out.r.sin_cambio && !out.r.cerradas && !out.r.protegidas && (
                              <p className="text-amber-700">Moodle no devolvió una nota importable de este alumno en esta aula (no está matriculado en ella, no tiene idnumber o aún no tiene total).</p>
                            )}
                            {out.r.parcial && (
                              <p className="text-amber-700">
                                Parcial: se consultó a {out.r.parcial.consultados} de {out.r.parcial.total} estudiantes y lo obtenido ya quedó importado.
                                Faltan {out.r.parcial.pendientes}: vuelve a pulsar y continúa donde quedó.
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-amber-700">{out.r.estado} — {out.r.detalle}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          {filtradas.length === 0 && <p className="text-sm text-gray-400 px-4 py-6">Sin asignaturas que coincidan.</p>}
        </div>
      )}
    </div>
  )
}
