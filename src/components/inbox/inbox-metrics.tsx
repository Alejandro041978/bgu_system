'use client'

import { useEffect, useState, useCallback } from 'react'
import { Mail, MessagesSquare, Bot, Loader2, Timer, CheckCircle2 } from 'lucide-react'

interface Bucket { bucket: string; emails: number; conversations: number; wa_conversations: number; sofia: number }
interface Totals { emails: number; conversations: number; email_conversations: number; whatsapp_conversations: number; sofia: number }
interface Sla {
  first_response: { count: number; median_ms: number | null; avg_ms: number | null }
  resolution: { count: number; median_ms: number | null; avg_ms: number | null; dist: { lt1h: number; lt4h: number; lt24h: number; gte24h: number } }
}
interface Data { start: string; end: string; granularity: string; totals: Totals; series: Bucket[]; sla?: Sla }

function fmtDur(ms: number | null): string {
  if (ms == null) return '—'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`
  const d = Math.floor(h / 24), hh = h % 24
  return hh ? `${d}d ${hh}h` : `${d}d`
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const fmtBucket = (b: string, g: string) => {
  const [y, m, d] = b.split('-')
  return g === 'week' ? `Sem. ${d}/${m}` : `${d}/${m}`
}

export function InboxMetrics() {
  const [start, setStart] = useState(iso(new Date(Date.now() - 29 * 86_400_000)))
  const [end, setEnd] = useState(iso(new Date()))
  const [granularity, setGranularity] = useState<'day' | 'week'>('day')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await fetch(`/api/inbox/metrics?start=${start}&end=${end}&granularity=${granularity}`).then(r => r.json())
    setData(d); setLoading(false)
  }, [start, end, granularity])
  useEffect(() => { load() }, [load])

  function preset(days: number) {
    setStart(iso(new Date(Date.now() - (days - 1) * 86_400_000)))
    setEnd(iso(new Date()))
  }

  const series = data?.series ?? []
  const max = Math.max(1, ...series.flatMap(s => [s.emails, s.conversations, s.sofia]))

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-500">Desde
          <input type="date" value={start} max={end} onChange={e => setStart(e.target.value)} className={inp} />
        </label>
        <label className="text-xs text-gray-500">Hasta
          <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} className={inp} />
        </label>
        <div className="text-xs text-gray-500">Agrupar
          <div className="flex gap-1 mt-1">
            {(['day', 'week'] as const).map(g => (
              <button key={g} onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${granularity === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {g === 'day' ? 'Día' : 'Semana'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1 ml-auto">
          <button onClick={() => preset(7)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 hover:bg-gray-50">7 días</button>
          <button onClick={() => preset(30)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 hover:bg-gray-50">30 días</button>
          <button onClick={() => preset(90)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 hover:bg-gray-50">90 días</button>
        </div>
      </div>

      {loading || !data ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card icon={<Mail className="w-4 h-4" />} label="Correos recibidos" value={data.totals.emails} sub={`${data.totals.email_conversations} conversaciones de correo`} cls="text-indigo-600" />
            <Card icon={<MessagesSquare className="w-4 h-4" />} label="Conversaciones (buzón)" value={data.totals.conversations} sub={`${data.totals.whatsapp_conversations} WhatsApp · ${data.totals.email_conversations} correo`} cls="text-blue-600" />
            <Card icon={<Bot className="w-4 h-4" />} label="Conversaciones a Sofía" value={data.totals.sofia} sub="Soporte por WhatsApp" cls="text-violet-600" />
          </div>

          {/* SLA: tiempos de atención */}
          {data.sla && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1"><Timer className="w-4 h-4" />Tiempo de 1ª respuesta (mediana)</div>
                <p className="text-2xl font-bold text-sky-600">{fmtDur(data.sla.first_response.median_ms)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{data.sla.first_response.count} caso(s) · prom. {fmtDur(data.sla.first_response.avg_ms)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1"><CheckCircle2 className="w-4 h-4" />Tiempo de resolución (mediana)</div>
                <p className="text-2xl font-bold text-green-600">{fmtDur(data.sla.resolution.median_ms)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{data.sla.resolution.count} cerrado(s) · prom. {fmtDur(data.sla.resolution.avg_ms)}</p>
                {data.sla.resolution.count > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">&lt;1h: {data.sla.resolution.dist.lt1h}</span>
                    <span className="px-2 py-0.5 rounded-full bg-lime-50 text-lime-700">1–4h: {data.sla.resolution.dist.lt4h}</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">4–24h: {data.sla.resolution.dist.lt24h}</span>
                    <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700">&gt;24h: {data.sla.resolution.dist.gte24h}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Gráfico de barras */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
              <Legend color="bg-indigo-500" label="Correos" />
              <Legend color="bg-blue-500" label="Conversaciones" />
              <Legend color="bg-violet-500" label="Sofía" />
            </div>
            {series.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">Sin datos en el rango.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex items-end gap-3 h-48 min-w-full" style={{ width: Math.max(series.length * 44, 100) }}>
                  {series.map(s => (
                    <div key={s.bucket} className="flex flex-col items-center gap-1 flex-1 min-w-[36px]">
                      <div className="flex items-end gap-0.5 h-40">
                        <Bar value={s.emails} max={max} color="bg-indigo-500" />
                        <Bar value={s.conversations} max={max} color="bg-blue-500" />
                        <Bar value={s.sofia} max={max} color="bg-violet-500" />
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtBucket(s.bucket, granularity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tabla */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5">{granularity === 'week' ? 'Semana' : 'Día'}</th>
                  <th className="text-right px-4 py-2.5">Correos <span className="normal-case text-gray-300">(mensajes)</span></th>
                  <th className="text-right px-4 py-2.5">Conversaciones</th>
                  <th className="text-right px-4 py-2.5">· WhatsApp</th>
                  <th className="text-right px-4 py-2.5">· Correo</th>
                  <th className="text-right px-4 py-2.5">Sofía</th>
                </tr>
              </thead>
              <tbody>
                {series.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin datos</td></tr>
                ) : series.map(s => (
                  <tr key={s.bucket} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2 text-gray-700">{s.bucket}</td>
                    <td className="px-4 py-2 text-right text-indigo-600">{s.emails}</td>
                    <td className="px-4 py-2 text-right text-blue-600 font-medium">{s.conversations}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{s.wa_conversations}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{s.conversations - s.wa_conversations}</td>
                    <td className="px-4 py-2 text-right text-violet-600">{s.sofia}</td>
                  </tr>
                ))}
              </tbody>
              {series.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold text-gray-800">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right">{data.totals.emails}</td>
                    <td className="px-4 py-2.5 text-right">{data.totals.conversations}</td>
                    <td className="px-4 py-2.5 text-right">{data.totals.whatsapp_conversations}</td>
                    <td className="px-4 py-2.5 text-right">{data.totals.email_conversations}</td>
                    <td className="px-4 py-2.5 text-right">{data.totals.sofia}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const h = value > 0 ? Math.max(3, Math.round((value / max) * 160)) : 0
  return <div className={`w-2.5 rounded-t ${color}`} style={{ height: h }} title={String(value)} />
}
function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${color}`} />{label}</span>
}
function Card({ icon, label, value, sub, cls }: { icon: React.ReactNode; label: string; value: number; sub: string; cls: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">{icon}{label}</div>
      <p className={`text-2xl font-bold ${cls}`}>{value.toLocaleString('es-PE')}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

const inp = 'block mt-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
