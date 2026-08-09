'use client'

import { useEffect, useState } from 'react'
import { Loader2, Gift, AlertTriangle } from 'lucide-react'

interface Fila {
  id: string; referente: string; documento: string | null; referido: string
  email: string; telefono: string | null; programa: string | null
  estado: string; etapa_lead: string | null
  lead_previo: boolean; lead_previo_nota: string | null
  dias: number; creado: string
}
interface Est { student_id: string; referente: string; documento: string | null; total: number; inscritos: number; ganado: number; aplicado: number; disponible: number }
interface Data {
  resumen: { referidos: number; inscritos: number; del_equipo: number; rescatados: number; conversion: number; ganado: number; aplicado: number; comprometido: number; costo_degree: number }
  filas: Fila[]; estudiantes: Est[]
}

const EST: Record<string, { label: string; cls: string }> = {
  registrado:      { label: 'Registrado',      cls: 'bg-gray-100 text-gray-600' },
  contactado:      { label: 'Contactado',      cls: 'bg-blue-50 text-blue-700' },
  en_conversacion: { label: 'En conversación', cls: 'bg-amber-50 text-amber-700' },
  inscrito:        { label: 'Inscrito',        cls: 'bg-green-50 text-green-700' },
  sin_interes:     { label: 'Sin interés',     cls: 'bg-gray-100 text-gray-500' },
  del_equipo:      { label: 'Del equipo',      cls: 'bg-violet-50 text-violet-700' },
  duplicado:       { label: 'Duplicado',       cls: 'bg-gray-100 text-gray-500' },
}
const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function ReferralsControl() {
  const [d, setD] = useState<Data | null>(null)
  const [vista, setVista] = useState<'referidos' | 'estudiantes'>('referidos')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admissions/referrals').then(r => r.json()).then(j => {
      if (j.error) setError(j.error); else setD(j)
    }).catch(() => setError('No se pudo cargar'))
  }, [])

  if (error) return <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</p>
  if (!d) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  const r = d.resumen
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Referidos" value={String(r.referidos)} />
        <Stat label="Inscritos" value={String(r.inscritos)} cls="text-green-700" />
        <Stat label="Conversión" value={`${r.conversion}%`} accent />
        <Stat label="Ganado" value={money(r.ganado)} />
        <Stat label="Ya aplicado" value={money(r.aplicado)} />
        {/* El número que importa: descuento prometido que todavía no aparece
            en ningún estado de cuenta porque nadie ha pedido su titulación. */}
        <Stat label="Comprometido" value={money(r.comprometido)} cls="text-amber-700" />
      </div>

      {r.del_equipo > 0 && (
        <p className="flex items-start gap-2 text-xs text-gray-500">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-violet-500" />
          {r.del_equipo} referido(s) quedaron como <b className="mx-1">Del equipo</b> — ya los estaba trabajando Admisión, así
          que no generan crédito. {r.rescatados > 0 && `Otros ${r.rescatados} existían en el CRM pero llevaban 3 meses fríos y pasaron al estudiante.`}
        </p>
      )}

      <div className="flex gap-2">
        {([['referidos', 'Por referido'], ['estudiantes', 'Por estudiante']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${vista === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {vista === 'referidos' ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5">Referido</th>
                  <th className="text-left px-3 py-2.5">Lo trajo</th>
                  <th className="text-left px-3 py-2.5">Programa</th>
                  <th className="text-left px-3 py-2.5 w-36">Estado</th>
                  <th className="text-center px-3 py-2.5 w-24">Días</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {d.filas.map(f => {
                  const e = EST[f.estado] ?? EST.registrado
                  return (
                    <tr key={f.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-800">{f.referido}</p>
                        <p className="text-[11px] text-gray-400">{f.email}{f.telefono ? ` · ${f.telefono}` : ''}</p>
                        {f.lead_previo && <p className="text-[11px] text-violet-600 mt-0.5">Ya existía en el CRM: {f.lead_previo_nota}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-gray-700">{f.referente}</p>
                        <p className="text-[11px] text-gray-400">{f.documento ?? '—'}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{f.programa ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${e.cls}`}>{e.label}</span>
                        {f.etapa_lead && <p className="text-[11px] text-gray-400 mt-0.5">embudo: {f.etapa_lead}</p>}
                      </td>
                      <td className={`px-3 py-2.5 text-center tabular-nums ${f.dias > 14 && f.estado !== 'inscrito' ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{f.dias}</td>
                    </tr>
                  )
                })}
                {!d.filas.length && <tr><td colSpan={5} className="text-center text-gray-400 py-12 text-sm"><Gift className="w-8 h-8 mx-auto mb-2 text-gray-300" />Todavía no hay referidos.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5">Estudiante</th>
                  <th className="text-center px-3 py-2.5 w-24">Referidos</th>
                  <th className="text-center px-3 py-2.5 w-24">Inscritos</th>
                  <th className="text-right px-3 py-2.5 w-28">Ganado</th>
                  <th className="text-right px-3 py-2.5 w-28">Aplicado</th>
                  <th className="text-right px-3 py-2.5 w-28">Disponible</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {d.estudiantes.map(e => (
                  <tr key={e.student_id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{e.referente}</p>
                      <p className="text-[11px] text-gray-400">{e.documento ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">{e.total}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-green-700">{e.inscritos}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(e.ganado)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{money(e.aplicado)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-700">{money(e.disponible)}</td>
                  </tr>
                ))}
                {!d.estudiantes.length && <tr><td colSpan={6} className="text-center text-gray-400 py-12 text-sm">Sin datos.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent, cls }: { label: string; value: string; accent?: boolean; cls?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${cls ?? (accent ? 'text-blue-700' : 'text-gray-900')}`}>{value}</p>
    </div>
  )
}
