'use client'

import { useState } from 'react'
import { CalendarDays, Plus, Trash2, Loader2, X } from 'lucide-react'
import { useIAP, BINDING, type Medida, type Disponible } from './assessment-shared'

// ---------------------------------------------------------------------------
// EL PLAN SISTÉMICO — el documento, no los números.
//
// Corrección del usuario (17/09/2026): los KPIs del plan de evaluación NO se
// relacionan con los objetivos estratégicos. Se listan directamente: primero
// los directos (D-##) y luego los indirectos (I-##). Y se trabaja igual que
// Cargar Plan · Efectividad: lista de planes creados, "Nuevo plan" y
// "Vincular KPI" dentro del plan elegido. Los resultados viven en el tablero
// de medidas y en el dashboard; aquí se ve el armazón.
// ---------------------------------------------------------------------------
export function AssessmentPlan() {
  const { d, planId, cargando, error, traer } = useIAP()
  const [nuevoAnio, setNuevoAnio] = useState('')
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [mostrarVincular, setMostrarVincular] = useState(false)
  const [elegido, setElegido] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function post(body: object): Promise<{ ok?: boolean; error?: string; plan_id?: string }> {
    setOcupado(true); setMsg(null)
    const r = await fetch('/api/planning/assessment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) { setMsg(j.error ?? 'No se pudo guardar'); return { error: j.error } }
    return j
  }

  async function crearPlan() {
    if (!nuevoAnio) return
    const r = await post({ action: 'crear_plan', academic_year_id: nuevoAnio })
    if (r.ok) { setMostrarNuevo(false); setNuevoAnio(''); traer(r.plan_id) }
  }
  async function vincular() {
    if (!elegido || !d) return
    const r = await post({ action: 'vincular', plan_id: d.plan.id, indicator_id: elegido })
    if (r.ok) { setElegido(''); traer(d.plan.id) }
  }
  async function desvincular(m: Medida) {
    if (!d) return
    if (!confirm(`¿Quitar ${m.code} · ${m.name} de ${d.plan.name}?\n\nSe borra su ficha en este plan (propósito, meta, responsable). No se puede quitar si ya tiene resultado o evidencia.`)) return
    const r = await post({ action: 'desvincular', measure_id: m.id })
    if (r.ok) traer(d.plan.id)
  }

  if (cargando && !d) return <p className="text-sm text-gray-500">Cargando el plan…</p>
  if (error && !d) return <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
  if (!d) return null
  // El panel de "Nuevo plan" sirve también cuando todavía no existe ninguno.
  const panelNuevo = (
    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
      <p className="text-xs font-medium text-gray-700">Año académico del nuevo plan</p>
      <select value={nuevoAnio} onChange={e => setNuevoAnio(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm">
        <option value="">— Elegir —</option>
        {d.anios_sin_plan.map(y => <option key={y.id} value={y.id}>{y.etiqueta}</option>)}
      </select>
      {!d.anios_sin_plan.length && <p className="text-[11px] text-amber-700">Todos los años académicos ya tienen su plan.</p>}
      <p className="text-[11px] text-gray-500">El plan nace vacío: luego se le vinculan los KPIs del plan de evaluación que ese año va a usar.</p>
      <div className="flex gap-2">
        <button onClick={crearPlan} disabled={!nuevoAnio || ocupado}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">
          {ocupado ? 'Creando…' : 'Crear plan'}
        </button>
        <button onClick={() => { setMostrarNuevo(false); setNuevoAnio('') }} className="text-xs text-gray-500 hover:underline">Cancelar</button>
      </div>
    </div>
  )

  if (d.sin_planes) {
    return (
      <div className='max-w-md space-y-3'>
        <p className='text-sm text-gray-600'>Todavía no hay ningún plan de evaluación. Crea el primero eligiendo su año académico.</p>
        {msg && <p className='text-sm text-red-700'>{msg}</p>}
        {panelNuevo}
      </div>
    )
  }

  const orden = (a: Medida, b: Medida) => a.code.localeCompare(b.code)
  const directos = d.medidas.filter(m => m.tipo === 'directa').sort(orden)
  const indirectos = d.medidas.filter(m => m.tipo === 'indirecta').sort(orden)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      {/* Planes creados */}
      <aside>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-800">Planes</p>
          <button onClick={() => setMostrarNuevo(v => !v)} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <Plus className="h-3.5 w-3.5" /> Nuevo plan
          </button>
        </div>
        <div className="space-y-2">
          {d.planes.map(p => (
            <button key={p.id} onClick={() => traer(p.id)} disabled={cargando}
              className={`w-full text-left rounded-lg border px-3 py-2.5 ${p.id === planId ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
              <p className={`text-[13px] font-medium ${p.id === planId ? 'text-blue-800' : 'text-gray-800'}`}>{p.name}</p>
              <p className="text-[11px] text-gray-500">{p.anio ?? '—'} · {p.medidas} KPI{p.medidas === 1 ? '' : 's'}</p>
            </button>
          ))}
        </div>
        {mostrarNuevo && panelNuevo}
      </aside>

      <div className="space-y-6 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">{d.plan.name}</p>
            <p className="text-xs text-gray-500">
              Versión {d.plan.version}{d.plan.doc_owner ? ` · ${d.plan.doc_owner}` : ''}
              {d.anio ? ` · año académico ${d.anio.etiqueta}` : ''}
            </p>
          </div>
          <button onClick={() => { setMostrarVincular(v => !v); setMsg(null) }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Vincular KPI
          </button>
        </div>

        {msg && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}

        {mostrarVincular && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">Vincular KPI al plan</p>
              <button onClick={() => setMostrarVincular(false)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <select value={elegido} onChange={e => setElegido(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="">— Seleccionar KPI —</option>
              {(['directa', 'indirecta'] as const).map(t => (
                <optgroup key={t} label={t === 'directa' ? 'Directos' : 'Indirectos'}>
                  {d.disponibles.filter((x: Disponible) => x.tipo === t).map(x => (
                    <option key={x.indicator_id} value={x.indicator_id}>{x.code} · {x.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {!d.disponibles.length && (
              <p className="text-[11px] text-amber-700">Todos los KPIs del plan de evaluación ya están vinculados a este plan.</p>
            )}
            <p className="text-[11px] text-gray-400">
              Solo aparecen los KPIs que el Catálogo de KPIs declara del plan de evaluación y que aún no están en este plan.
              La ficha nace copiando la definición más reciente (propósito, meta, responsable, origen); el resultado y la evidencia son del año.
            </p>
            <button onClick={vincular} disabled={!elegido || ocupado}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Vincular'}
            </button>
          </div>
        )}

        {/* KPIs del plan: directos y luego indirectos */}
        {[{ titulo: 'KPIs directos (D)', lista: directos, cls: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
          { titulo: 'KPIs indirectos (I)', lista: indirectos, cls: 'border-teal-200 bg-teal-50 text-teal-700' }].map(g => (
          <div key={g.titulo} className="rounded-lg border border-gray-200 overflow-hidden">
            <p className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500">{g.titulo} · {g.lista.length}</p>
            {g.lista.length ? (
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase text-gray-400">
                  <tr>
                    <th className="px-3 py-2 font-medium w-16">Código</th>
                    <th className="px-3 py-2 font-medium">KPI</th>
                    <th className="px-3 py-2 font-medium">Frecuencia</th>
                    <th className="px-3 py-2 font-medium">Origen</th>
                    <th className="px-3 py-2 font-medium">Responsable</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {g.lista.map(m => {
                    const bind = BINDING[m.binding] ?? BINDING.pendiente
                    return (
                      <tr key={m.id} className="border-t border-gray-100 align-top">
                        <td className="px-3 py-2"><span className={`rounded border px-1.5 py-0.5 text-[11px] ${g.cls}`}>{m.code}</span></td>
                        <td className="px-3 py-2 text-[13px] text-gray-800">
                          {m.name}
                          {m.proposito && <p className="text-[11.5px] text-gray-400 line-clamp-2">{m.proposito}</p>}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-gray-500">{m.frecuencia ?? '—'}{m.ventana ? <span className="block text-[11px] text-gray-400">{m.ventana}</span> : null}</td>
                        <td className="px-3 py-2"><span className={`rounded border px-1.5 py-0.5 text-[10.5px] ${bind.cls}`}>{bind.txt}</span></td>
                        <td className="px-3 py-2 text-[12px] text-gray-500">{m.responsable ?? m.unidad ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => desvincular(m)} disabled={ocupado} title="Quitar del plan" className="text-gray-300 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-4 text-xs text-gray-400">Este plan aún no tiene KPIs de este tipo. Usa «Vincular KPI».</p>
            )}
          </div>
        ))}

        {/* Calendario */}
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            Calendario del ciclo anual
            <span className="font-normal text-gray-400">
              {d.anio ? `· ${d.anio.start_date} → ${d.anio.end_date}` : ''}
            </span>
          </h2>

          {!!d.cobertura.calendario_con_codigos_rotos && (
            <div className="mb-2 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800">
              <b>{d.cobertura.calendario_con_codigos_rotos} de {d.calendario.length} filas</b> apuntan a KPIs que este
              plan no tiene. Hasta que se reconcilie, esas actividades no se pueden ejecutar contra nada.
            </div>
          )}

          {d.calendario.length ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-[11px] uppercase text-gray-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Periodo</th>
                    <th className="px-3 py-2 font-medium">Actividad</th>
                    <th className="px-3 py-2 font-medium">KPIs</th>
                    <th className="px-3 py-2 font-medium">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {d.calendario.map(c => (
                    <tr key={c.seq} className={`border-t border-gray-100 ${c.desconocidas.length ? 'bg-red-50/40' : ''}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-[12px] font-medium text-gray-700">{c.periodo}</td>
                      <td className="px-3 py-2 text-[12.5px] text-gray-600">{c.actividad}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {c.medidas.map(m => (
                            <span key={m} className={`rounded border px-1 py-0.5 text-[10.5px] ${
                              c.desconocidas.some(x => m.includes(x))
                                ? 'border-red-300 bg-red-100 text-red-800'
                                : 'border-gray-200 bg-gray-50 text-gray-600'}`}>{m}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[12px] text-gray-500">{c.responsable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Este plan no tiene calendario cargado.</p>
          )}
        </div>
      </div>
    </div>
  )
}
