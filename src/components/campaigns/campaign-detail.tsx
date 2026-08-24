'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, MessageCircle, AlertTriangle } from 'lucide-react'

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
        <span className="text-xs text-gray-400">{c.cupo_diario}/día · plantilla {c.plantilla}</span>
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
    </div>
  )
}
