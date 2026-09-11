'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, MessageCircle, AlertTriangle, Pencil } from 'lucide-react'
import { SuggestionsView } from '@/components/sofia/suggestions-view'
import { SurveyResults } from '@/components/campaigns/survey-results'
import { usePermissions } from '@/hooks/use-permissions'

interface Row {
  student_id: string; name: string; document: string | null; situation: string | null
  sent_at: string; status: string; replied_at: string | null; exito: boolean; toques: number
  error: string | null; note: string | null
}
interface Data {
  campaign: { key: string; nombre: string; descripcion: string | null; activa: boolean; cupo_diario: number; bot: string; plantilla: string }
  funnel: { elegibles: number; en_cola: number; contactados: number; respondieron: number; exito: number; exito_label: string; tasa_respuesta: number; tasa_exito: number }
  rows: Row[]
}

const fdt = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '—'

export function CampaignDetail({ campaignKey }: { campaignKey: string }) {
  const [dias, setDias] = useState(0)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Intensidad (contactos/día): la edita quien tiene EDITAR en esta campaña.
  const { canEdit } = usePermissions()
  const puedeEditar = canEdit(`campaign_${campaignKey}`)
  const [editandoCupo, setEditandoCupo] = useState(false)
  const [cupoDraft, setCupoDraft] = useState('')
  const [cupoBusy, setCupoBusy] = useState(false)
  const [cupoMsg, setCupoMsg] = useState<string | null>(null)

  async function guardarCupo() {
    setCupoBusy(true); setCupoMsg(null)
    const r = await fetch(`/api/campaigns/detail/${campaignKey}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_cap: Number(cupoDraft) }),
    })
    const j = await r.json().catch(() => ({}))
    setCupoBusy(false)
    if (!r.ok) { setCupoMsg(j.error ?? 'No se pudo guardar'); return }
    setEditandoCupo(false)
    setData(d => d ? { ...d, campaign: { ...d.campaign, cupo_diario: Number(cupoDraft) } } : d)
  }

  useEffect(() => {
    setData(null)
    fetch(`/api/campaigns/detail/${campaignKey}${dias ? `?dias=${dias}` : ''}`).then(r => r.json())
      .then(d => d.error ? setError(d.error) : setData(d))
      .catch(() => setError('No se pudo cargar'))
  }, [campaignKey, dias])

  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
  if (!data) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  const c = data.campaign, f = data.funnel
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${c.activa ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          <span className={`w-2 h-2 rounded-full ${c.activa ? 'bg-green-500' : 'bg-gray-400'}`} /> {c.activa ? 'Campaña encendida' : 'Campaña apagada'}
        </span>
        {editandoCupo ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <input type="number" min={1} max={100} value={cupoDraft} onChange={e => setCupoDraft(e.target.value)} autoFocus
              className="w-16 border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-400">/día</span>
            <button onClick={guardarCupo} disabled={cupoBusy} className="text-blue-600 hover:underline disabled:opacity-50">{cupoBusy ? '…' : 'guardar'}</button>
            <button onClick={() => { setEditandoCupo(false); setCupoMsg(null) }} className="text-gray-400 hover:underline">cancelar</button>
            {cupoMsg && <span className="text-red-600">{cupoMsg}</span>}
          </span>
        ) : (
          <span className="text-xs text-gray-400 inline-flex items-center gap-1">
            {c.cupo_diario}/día · plantilla {c.plantilla}
            {puedeEditar && (
              <button onClick={() => { setEditandoCupo(true); setCupoDraft(String(c.cupo_diario)) }}
                title="Cambiar la intensidad (contactos por día)" className="p-0.5 text-gray-300 hover:text-blue-500">
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </span>
        )}
        <select value={dias} onChange={e => setDias(Number(e.target.value))}
          className="ml-auto border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
          <option value={0}>Todo el historial</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
      </div>
      {c.descripcion && <p className="text-xs text-gray-500 -mt-2">{c.descripcion}</p>}

      <div className="bg-gradient-to-r from-green-600 to-green-500 text-white rounded-2xl px-5 py-4">
        <p className="text-[11px] uppercase tracking-wide opacity-80">{f.exito_label}</p>
        <p className="text-3xl font-bold tabular-nums">{f.exito}</p>
        <p className="text-xs opacity-80">de {f.contactados} contactados · {f.tasa_exito}% — verificado contra el hecho, no contra lo que prometieron</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Elegibles hoy', v: f.elegibles },
          { label: 'En cola', v: f.en_cola },
          { label: 'Contactados', v: f.contactados },
          { label: 'Respondieron', v: f.respondieron, extra: `${f.tasa_respuesta}%` },
          { label: f.exito_label, v: f.exito, extra: `${f.tasa_exito}%` },
        ].map(x => (
          <div key={x.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-[11px] text-gray-500">{x.label}</p>
            <p className="text-xl font-bold tabular-nums text-gray-900">{x.v}{x.extra ? <span className="text-xs font-normal text-gray-400"> · {x.extra}</span> : null}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide">
              <th className="text-left px-4 py-2.5">Estudiante</th>
              <th className="text-left px-4 py-2.5">Último toque</th>
              <th className="text-center px-4 py-2.5">Toques</th>
              <th className="text-left px-4 py-2.5">Respondió</th>
              <th className="text-left px-4 py-2.5">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Sin contactos {dias ? 'en la ventana elegida' : 'todavía'}.</td></tr>
            )}
            {data.rows.map(r => (
              <tr key={r.student_id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2">
                  <a href={`/academic/students?id=${r.student_id}`} className="text-blue-600 hover:underline">{r.name}</a>
                  <p className="text-[11px] text-gray-400">{r.document ?? ''}{r.situation ? ` · ${r.situation}` : ''}</p>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {fdt(r.sent_at)}
                  {r.status === 'failed' && <span className="ml-1 inline-flex items-center gap-0.5 text-red-600"><AlertTriangle className="w-3 h-3" />falló</span>}
                </td>
                <td className="px-4 py-2 text-center text-xs text-gray-500 tabular-nums">{r.toques}</td>
                <td className="px-4 py-2 text-xs">
                  {r.replied_at
                    ? <span className="inline-flex items-center gap-1 text-amber-700"><MessageCircle className="w-3.5 h-3.5" />{fdt(r.replied_at)}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2 text-xs">
                  {r.exito
                    ? <span className="inline-flex items-center gap-1 text-green-700 font-medium"><CheckCircle2 className="w-3.5 h-3.5" />{f.exito_label}</span>
                    : <span className="text-gray-300">aún no</span>}
                  {r.note && <p className="text-[11px] text-gray-400">{r.note}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">Una fila por estudiante (su último toque manda). El resultado se verifica contra hechos posteriores al contacto: pago, conexión al aula, solicitud o reincorporación, según la campaña.</p>

      {/* Resultados de la Encuesta de Titulados en tiempo real, por año
          académico (solo en la campaña de la encuesta). */}
      {campaignKey === 'survey_titulados' && (
        <div className="pt-4 border-t border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Resultados de la encuesta</h2>
          <SurveyResults />
        </div>
      )}

      {/* Mejora continua de la campaña (10/09/2026): las propuestas del
          supervisor de Camila para ESTA campaña. Ver = leerlas; aprobar exige
          el permiso de editar de la campaña (lo exige el servidor). */}
      <div className="pt-4 border-t border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Mejora continua de esta campaña</h2>
        <SuggestionsView bots={[]} campaign={campaignKey} />
      </div>
    </div>
  )
}
