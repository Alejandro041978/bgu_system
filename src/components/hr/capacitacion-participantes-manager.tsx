'use client'

import { useState, useEffect } from 'react'
import { Loader2, UserPlus, Trash2 } from 'lucide-react'
import type { Capacitacion } from './capacitaciones-manager'

interface Employee {
  id: string
  full_name: string
  position?: string
}

interface Participante {
  id: string
  capacitacion_id: string
  employee_id: string
  created_at: string
  employee: { full_name: string; position?: string } | null
}

export function CapacitacionParticipantesManager() {
  const [capacitaciones, setCapacitaciones] = useState<Capacitacion[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [participantes, setParticipantes] = useState<Participante[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingCaps, setLoadingCaps] = useState(true)
  const [loadingParts, setLoadingParts] = useState(false)
  const [addingId, setAddingId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/hr/capacitaciones').then(r => r.json()),
      fetch('/api/hr/employees').then(r => r.json()),
    ]).then(([caps, emps]: [Capacitacion[], Employee[]]) => {
      setCapacitaciones(caps)
      setEmployees(emps)
      setLoadingCaps(false)
    }).catch(() => setLoadingCaps(false))
  }, [])

  useEffect(() => {
    if (!selectedId) { setParticipantes([]); return }
    setLoadingParts(true)
    fetch(`/api/hr/capacitacion-participantes?capacitacion_id=${selectedId}`)
      .then(r => r.json())
      .then((d: Participante[]) => { setParticipantes(d); setLoadingParts(false) })
      .catch(() => setLoadingParts(false))
  }, [selectedId])

  async function handleAdd() {
    if (!addingId || !selectedId) return
    setSaving(true); setError(null)
    const res = await fetch('/api/hr/capacitacion-participantes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capacitacion_id: selectedId, employee_id: addingId }),
    })
    const data = await res.json() as Participante & { error?: string }
    if (!res.ok) { setError(data.error ?? 'Error al agregar'); setSaving(false); return }
    const emp = employees.find(e => e.id === addingId)
    setParticipantes(prev => [...prev, { ...data, employee: emp ?? null }])
    setAddingId('')
    setSaving(false)
  }

  async function handleRemove(id: string) {
    const res = await fetch('/api/hr/capacitacion-participantes', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setParticipantes(prev => prev.filter(p => p.id !== id))
    else { const d = await res.json() as { error?: string }; alert(d.error ?? 'Error') }
  }

  const participantIds = new Set(participantes.map(p => p.employee_id))
  const available = employees.filter(e => !participantIds.has(e.id))
  const selected = capacitaciones.find(c => c.id === selectedId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Participantes de Capacitación</h2>
        <p className="text-sm text-gray-500">Selecciona una capacitación para gestionar sus participantes</p>
      </div>

      {loadingCaps ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: select training */}
          <div className="col-span-1 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Capacitaciones</p>
            <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
              {capacitaciones.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Sin capacitaciones registradas</p>
              ) : capacitaciones.map(c => (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selectedId === c.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  <p className="text-xs font-mono font-semibold text-gray-500">{c.id_capacitacion}</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5 leading-snug">{c.denominacion}</p>
                  {c.entidad_capacitadora && (
                    <p className="text-xs text-gray-400 mt-0.5">{c.entidad_capacitadora}</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right: participants */}
          <div className="col-span-2 space-y-4">
            {!selectedId ? (
              <div className="flex items-center justify-center h-48 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-sm text-gray-400">Selecciona una capacitación a la izquierda</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{selected?.denominacion}</p>
                    <p className="text-xs text-gray-400">{participantes.length} participante{participantes.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {/* Add participant */}
                <div className="flex gap-2">
                  <select value={addingId} onChange={e => { setAddingId(e.target.value); setError(null) }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Seleccionar colaborador…</option>
                    {available.map(e => (
                      <option key={e.id} value={e.id}>{e.full_name}{e.position ? ` · ${e.position}` : ''}</option>
                    ))}
                  </select>
                  <button onClick={handleAdd} disabled={!addingId || saving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    Agregar
                  </button>
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

                {loadingParts ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                ) : participantes.length === 0 ? (
                  <div className="text-center py-10 text-sm text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    Sin participantes registrados. Agrega uno arriba.
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">#</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Colaborador</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Cargo</th>
                          <th className="px-4 py-3 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {participantes.map((p, i) => (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{p.employee?.full_name ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{p.employee?.position ?? '—'}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => handleRemove(p.id)}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
