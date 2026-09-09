'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, X, Layers } from 'lucide-react'

// ---------------------------------------------------------------------------
// Elección de electivas (fase 2, la opera Registros): vive dentro del Registro
// Curricular. Muestra las casillas de la malla con su elección; para pools
// tipo especialidad, un selector que asigna el paquete completo; para menús,
// un selector por casilla. Quitar solo funciona mientras la elegida no tenga
// notas — con notas, el cambio es una decisión auditada.
// ---------------------------------------------------------------------------
interface Casilla { id: string; code: string | null; name: string; credits: number | null; eleccion: { course_id: string; label: string; pool_id: string | null } | null }
interface Pool { id: string; name: string; tipo: 'menu' | 'especialidad'; courses: { id: string; label: string }[] }
interface Data { enrollment_id: string; specialty_pool_id: string | null; casillas: Casilla[]; pools: Pool[] }

export function StudentElectivesPanel({ studentId, programId, onChanged }: { studentId: string; programId: string; onChanged?: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch(`/api/academic/student-electives?student_id=${studentId}&program_id=${programId}`)
      .then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    if (d.error) { setData(null); setError(d.error === 'Sin matrícula en el programa' ? null : d.error); return }
    setData(d); setError(null)
  }, [studentId, programId])
  useEffect(() => { load() }, [load])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function accion(body: Record<string, any>, confirmar?: string) {
    if (confirmar && !confirm(confirmar)) return
    setBusy(true); setError(null)
    const d = await fetch('/api/academic/student-electives', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, program_id: programId, ...body }),
    }).then(r => r.json()).catch(() => ({ error: 'Error de red' }))
    setBusy(false)
    if (d.error) { setError(d.error); return }
    load(); onChanged?.()
  }

  if (!data || data.casillas.length === 0) return null   // programa sin electivas: el panel no existe

  const especialidades = data.pools.filter(p => p.tipo === 'especialidad')
  const menus = data.pools.filter(p => p.tipo === 'menu')
  const sinEleccion = data.casillas.filter(c => !c.eleccion)
  const elegidasIds = new Set(data.casillas.map(c => c.eleccion?.course_id).filter(Boolean))
  const especialidadActual = especialidades.find(p => p.id === data.specialty_pool_id) ?? null

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-gray-300" />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Electivas</p>
        {especialidadActual && (
          <span className="text-[11px] font-medium bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
            Especialidad: {especialidadActual.name}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      <ul className="space-y-1">
        {data.casillas.map(c => (
          <li key={c.id} className="text-xs flex items-baseline gap-2">
            <span className="text-gray-700 w-40 shrink-0">{c.code ?? c.name} <span className="text-gray-400">({c.credits ?? '—'} cr)</span></span>
            {c.eleccion ? (
              <span className="inline-flex items-center gap-1.5 text-gray-800">
                {c.eleccion.label}
                <button disabled={busy} title="Quitar la elección (solo si la elegida no tiene notas)"
                  onClick={() => accion({ accion: 'quitar', slot_course_id: c.id }, `¿Quitar la elección de ${c.code ?? c.name}?`)}
                  className="text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            ) : menus.length > 0 ? (
              <select disabled={busy} defaultValue=""
                onChange={e => { if (e.target.value) accion({ accion: 'menu', slot_course_id: c.id, course_id: e.target.value }) }}
                className="border border-gray-200 rounded px-1.5 py-0.5 text-[11px]">
                <option value="">Elegir del menú…</option>
                {menus.flatMap(m => m.courses).filter(o => !elegidasIds.has(o.id)).map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            ) : (
              <span className="text-amber-700">sin elección</span>
            )}
          </li>
        ))}
      </ul>

      {especialidades.length > 0 && sinEleccion.length === data.casillas.length && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
          <span className="text-[11px] text-gray-500">Asignar especialidad (llena todas las casillas):</span>
          <select disabled={busy} defaultValue=""
            onChange={e => {
              const p = especialidades.find(x => x.id === e.target.value)
              if (p) accion({ accion: 'especialidad', pool_id: p.id },
                `¿Asignar la especialidad "${p.name}"?\n\nSus ${p.courses.length} asignaturas llenarán las ${data.casillas.length} casillas y se matricularán en el registro curricular.`)
              e.target.value = ''
            }}
            className="border border-gray-200 rounded px-1.5 py-0.5 text-[11px]">
            <option value="">Especialidad…</option>
            {especialidades.map(p => <option key={p.id} value={p.id}>{p.name} ({p.courses.length})</option>)}
          </select>
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        La casilla manda los créditos; la elegida es la que se cursa y se califica, y su aprobación cubre la casilla
        para el egreso. Quitar una elección solo es posible mientras la elegida no tenga notas.
      </p>
    </div>
  )
}
