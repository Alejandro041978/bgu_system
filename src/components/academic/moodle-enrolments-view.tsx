'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

// ---------------------------------------------------------------------------
// Aulas en Moodle — página independiente (antes vivía al pie de la Ficha del
// Estudiante; el usuario la separó el 07/09/2026). Consulta EN VIVO qué
// accesos tiene el estudiante en el campus: en qué aulas su matrícula está
// activa, en cuáles quedó suspendida (la baja por carrusel suspende, no
// borra) y dónde no cuadra con su carrusel actual.
// ---------------------------------------------------------------------------

interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }
interface AulaMoodle {
  aula: number; nombre: string; curso_code: string | null; curso_name: string | null
  estado: 'activa' | 'suspendida' | 'sin_matricula'
  esperada: boolean; anomalia: 'acceso_de_mas' | 'acceso_faltante' | null
}
interface EstadoAulas {
  error?: string; sin_cuenta?: boolean; uid?: number
  cuenta?: { suspendida: boolean; ultimo_acceso: number | null } | null
  aulas?: AulaMoodle[]; esperadas_sin_aula?: string[]
}

export function MoodleEnrolmentsView() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [searching, setSearching] = useState(false)
  const [student, setStudent] = useState<StudentHit | null>(null)

  async function buscar() {
    if (!q.trim()) return
    setSearching(true)
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(q.trim())}`)
      .then(r => r.json()).catch(() => ({}))
    setSearching(false)
    setHits(d.students ?? [])
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="Buscar estudiante por nombre, documento o correo…"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <button onClick={buscar} disabled={searching || !q.trim()}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl disabled:opacity-40">
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {hits.length > 0 && !student && (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
          {hits.map(h => (
            <button key={h.id} onClick={() => { setStudent(h); setHits([]) }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50">
              <p className="text-sm text-gray-800">{h.name}</p>
              <p className="text-[11px] text-gray-400">{h.document_number ?? '—'}{h.email ? ` · ${h.email}` : ''}</p>
            </button>
          ))}
        </div>
      )}

      {student && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{student.name}</p>
              <p className="text-[11px] text-gray-400">{student.document_number ?? '—'}</p>
            </div>
            <button onClick={() => { setStudent(null); setQ(''); setHits([]) }}
              className="ml-auto text-sm text-gray-500 hover:text-gray-800">Buscar otro</button>
          </div>
          <MoodleAulas studentId={student.id} />
        </>
      )}
    </div>
  )
}

// La consulta y la tabla — el mismo componente que vivía en la ficha.
function MoodleAulas({ studentId }: { studentId: string }) {
  const [st, setSt] = useState<EstadoAulas | null>(null)
  const [loading, setLoading] = useState(true)

  const traer = () => {
    setLoading(true)
    fetch(`/api/academic/moodle-enrolments?student_id=${studentId}`)
      .then(r => r.json())
      .then(setSt)
      .catch(() => setSt({ error: 'No se pudo consultar Moodle' }))
      .finally(() => setLoading(false))
  }
  useEffect(traer, [studentId])

  const chip = (a: AulaMoodle) => a.estado === 'activa'
    ? <span className="px-1.5 py-0.5 rounded text-[11px] bg-green-50 text-green-700">activa</span>
    : a.estado === 'suspendida'
      ? <span className="px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-500">suspendida</span>
      : <span className="px-1.5 py-0.5 rounded text-[11px] bg-gray-50 text-gray-400">sin matrícula</span>

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Aulas en Moodle (en vivo)</p>
        <button onClick={traer} disabled={loading} title="Volver a consultar Moodle"
          className="ml-auto text-blue-600 hover:text-blue-800 text-xs disabled:opacity-40">
          {loading ? 'Consultando…' : 'Actualizar'}
        </button>
      </div>

      {loading && !st ? (
        <p className="text-sm text-gray-400">Consultando el campus virtual…</p>
      ) : st?.error ? (
        <p className="text-sm text-red-600">{st.error}</p>
      ) : st?.sin_cuenta ? (
        <p className="text-sm text-gray-400">No tiene cuenta en el campus virtual.</p>
      ) : st ? (
        <>
          {st.cuenta && (
            <p className="text-xs text-gray-500">
              Cuenta {st.cuenta.suspendida
                ? <span className="text-red-600 font-medium">suspendida</span>
                : <span className="text-green-700">habilitada</span>}
              {' · '}último acceso: {st.cuenta.ultimo_acceso
                ? new Date(st.cuenta.ultimo_acceso * 1000).toLocaleDateString('es-PE')
                : 'nunca'}
            </p>
          )}
          {(st.aulas ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">Sin aulas conocidas para este estudiante.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-400 uppercase tracking-wide text-left">
                    <th className="py-1 pr-3 font-medium">Aula</th>
                    <th className="py-1 pr-3 font-medium">Asignatura</th>
                    <th className="py-1 pr-3 font-medium">Acceso</th>
                    <th className="py-1 font-medium">Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {(st.aulas ?? []).map(a => (
                    <tr key={a.aula} className="border-t border-gray-100">
                      <td className="py-1.5 pr-3 text-gray-800">{a.nombre}<span className="text-gray-300 text-xs"> · {a.aula}</span></td>
                      <td className="py-1.5 pr-3 text-gray-600">{a.curso_code ? `${a.curso_code} — ${a.curso_name}` : <span className="text-gray-300">sin vínculo</span>}</td>
                      <td className="py-1.5 pr-3">{chip(a)}</td>
                      <td className="py-1.5">
                        {a.anomalia === 'acceso_de_mas' && <span className="text-amber-700 text-xs">Activa, pero no es de su carrusel actual</span>}
                        {a.anomalia === 'acceso_faltante' && <span className="text-red-600 text-xs">Su carrusel la requiere y no tiene acceso</span>}
                        {!a.anomalia && a.esperada && <span className="text-gray-400 text-xs">de su carrusel actual</span>}
                        {!a.anomalia && !a.esperada && a.estado === 'suspendida' && <span className="text-gray-400 text-xs">acceso retirado (notas conservadas)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(st.esperadas_sin_aula ?? []).length > 0 && (
            <p className="text-[11px] text-amber-700">
              Asignaturas de su carrusel sin aula asignada en su colección: {(st.esperadas_sin_aula ?? []).join(', ')} — se corrige en Colecciones de aulas.
            </p>
          )}
          <p className="text-[11px] text-gray-400">
            Consulta en vivo al campus. «Suspendida» = matriculado sin acceso (sus calificaciones se conservan); es el estado normal de las aulas de carruseles ya completados.
          </p>
        </>
      ) : null}
    </div>
  )
}
