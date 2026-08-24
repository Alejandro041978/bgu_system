'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'

interface Elegibles {
  student: { id: string; name: string; document_number: string | null }
  elegibles: {
    grade_external_id: string; course_code: string | null; course_name: string | null
    final: number | null; passing: number | null; pct_rendida: number
    cumple_participacion: boolean
  }[]
  tipos: { id: string; name: string; price: number }[]
  // El superadministrador ve además las que no llegan al 50% de participación.
  puede_exceptuar: boolean
}

// ---------------------------------------------------------------------------
// Alta de una solicitud de examen EN NOMBRE del estudiante.
//
// Hasta ahora la única puerta era el portal del estudiante. Ésta es la segunda,
// para cuando el estudiante no puede o no sabe pedirla.
//
// La lista de asignaturas no se escribe a mano: la calcula el servidor con la
// MISMA regla que el portal —desaprobada y con al menos el 50% de la
// ponderación rendida—. Registros no puede ofrecer aquí algo que el estudiante
// no podría pedir por su cuenta; si una asignatura no aparece, no es que falte
// buscarla, es que no califica.
// ---------------------------------------------------------------------------
export function NuevaSolicitudExamen({ onCerrar, onCreada }: {
  onCerrar: () => void
  onCreada: (texto: string) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [hits, setHits] = useState<{ id: string; name: string; document_number: string | null }[]>([])
  const [elegido, setElegido] = useState<Elegibles | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [curso, setCurso] = useState('')
  const [tipo, setTipo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Motivo de la excepción, obligatorio cuando la asignatura no llega al 50%.
  const [motivo, setMotivo] = useState('')

  async function buscar() {
    if (busqueda.trim().length < 2) return
    setBuscando(true); setErr(null)
    try {
      const d = await fetch(`/api/students/search?q=${encodeURIComponent(busqueda.trim())}`).then(r => r.json())
      setHits(d.students ?? [])
    } catch { setErr('No se pudo buscar') } finally { setBuscando(false) }
  }

  async function elegir(id: string) {
    setErr(null); setCurso(''); setTipo('')
    try {
      const r = await fetch(`/api/academic/exams?student=${id}`)
      const d = await r.json()
      if (!r.ok || d.error) { setErr(d.error ?? 'Error'); return }
      setElegido(d)
      // Con un solo tipo activo, elegirlo por el usuario es quitarle un clic
      // que no decide nada.
      if ((d.tipos ?? []).length === 1) setTipo(d.tipos[0].id)
    } catch { setErr('No se pudo cargar al estudiante') }
  }

  const cursoElegido = elegido?.elegibles.find(e => e.grade_external_id === curso) ?? null
  const necesitaMotivo = !!cursoElegido && !cursoElegido.cumple_participacion

  async function crear() {
    if (!elegido || !curso || !tipo) return
    if (necesitaMotivo && !motivo.trim()) { setErr('Escribe el motivo de la excepción.'); return }
    setGuardando(true); setErr(null)
    try {
      const r = await fetch('/api/academic/exams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: elegido.student.id, exam_type_id: tipo, grade_external_id: curso,
          ...(necesitaMotivo ? { motivo_excepcion: motivo.trim() } : {}),
        }),
      })
      const d = await r.json()
      if (!r.ok || d.error) { setErr(d.error ?? 'No se pudo crear'); return }
      const c = elegido.elegibles.find(e => e.grade_external_id === curso)
      onCreada(`Solicitud creada para ${elegido.student.name} · ${c?.course_name ?? ''}${d.sin_participacion ? ' (con excepción al mínimo de participación)' : ''}. Se generó un cargo de $${d.charge} en su estado de cuenta; pasará a "Pendientes de evaluación" cuando lo pague.`)
    } catch { setErr('Error de red') } finally { setGuardando(false) }
  }

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Nueva solicitud en nombre del estudiante</p>
        <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
      </div>

      {!elegido ? (
        <>
          <div className="flex gap-2">
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') buscar() }}
              placeholder="Nombre o documento del estudiante"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={buscar} disabled={buscando || busqueda.trim().length < 2}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </button>
          </div>
          {hits.length > 0 && (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-56 overflow-auto">
              {hits.map(h => (
                <button key={h.id} onClick={() => elegir(h.id)} className="w-full text-left px-3 py-2 hover:bg-gray-50">
                  <span className="text-sm text-gray-800">{h.name}</span>
                  <span className="block text-[11px] text-gray-400">{h.document_number ?? '—'}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            {elegido.student.name}
            <span className="text-[11px] text-gray-400"> · {elegido.student.document_number ?? '—'}</span>
            <button onClick={() => { setElegido(null); setCurso('') }} className="ml-2 text-xs text-blue-600 hover:text-blue-800">cambiar</button>
          </p>

          {elegido.elegibles.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              Este estudiante no tiene asignaturas que califiquen: hace falta estar desaprobado y haber rendido al
              menos el 50% de la ponderación. Si una asignatura no aparece, no califica — no es que falte buscarla.
            </p>
          ) : (
            <>
              <select value={curso} onChange={e => setCurso(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Elige la asignatura…</option>
                {elegido.elegibles.map(e => (
                  <option key={e.grade_external_id} value={e.grade_external_id}>
                    {e.cumple_participacion ? '' : '⚠ '}
                    {e.course_name} — nota {e.final ?? '—'} de {e.passing ?? '—'} · rindió {e.pct_rendida}%
                    {e.cumple_participacion ? '' : ' (no llega al 50%)'}
                  </option>
                ))}
              </select>
              {/* La excepción se pide en el momento y con motivo. Sin esto, una
                  autorización y un descuido se ven igual dentro de seis meses. */}
              {necesitaMotivo && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-2">
                  <p className="text-xs text-amber-800">
                    <b>{cursoElegido?.course_name}</b> rindió el {cursoElegido?.pct_rendida}% de la ponderación
                    y la regla pide 50%. Puedes autorizarlo igual, pero queda registrado como excepción con
                    tu nombre.
                  </p>
                  <input value={motivo} onChange={e => setMotivo(e.target.value)}
                    placeholder="Motivo de la excepción (obligatorio)"
                    className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              )}
              <select value={tipo} onChange={e => setTipo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Elige el tipo de examen…</option>
                {elegido.tipos.map(t => <option key={t.id} value={t.id}>{t.name} · ${t.price}</option>)}
              </select>
            </>
          )}
        </>
      )}

      {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

      {elegido && elegido.elegibles.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400">
            Genera un cargo en el estado de cuenta del estudiante, igual que si lo pidiera desde su portal.
            Queda registrado que la creaste tú.
          </p>
          <button onClick={crear} disabled={!curso || !tipo || guardando || (necesitaMotivo && !motivo.trim())}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
            {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Crear solicitud
          </button>
        </div>
      )}
    </div>
  )
}
