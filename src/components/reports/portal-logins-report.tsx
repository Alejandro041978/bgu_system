'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Users, LogIn, Wifi } from 'lucide-react'

interface Row { id: string; logged_at: string; email: string; ip: string | null; name: string | null; document: string | null }
interface Dia { dia: string; ingresos: number; estudiantes: number }
interface Conectado { student_id: string; email: string; last_seen: string; name: string | null; document: string | null }
interface Data {
  from: string; to: string
  resumen: { ingresos_7d: number; ingresos_30d: number; estudiantes_7d: number; estudiantes_30d: number }
  por_dia: Dia[]
  conectados: Conectado[]
  rows: Row[]
}

const flocal = (iso: string) => new Date(iso).toLocaleString('es-PE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const fdia = (d: string) => d.split('-').reverse().join('/')
const hoy = () => new Date().toISOString().slice(0, 10)
const hace = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export function PortalLoginsReport() {
  const [data, setData] = useState<Data | null>(null)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState(hace(29))
  const [to, setTo] = useState(hoy())
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/reports/portal-logins?from=${from}&to=${to}&q=${encodeURIComponent(q)}`)
      .then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false) })
  }, [from, to, q])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  // Refresca "conectados" cada 60s sin que el usuario haga nada
  useEffect(() => {
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const maxDia = Math.max(1, ...(data?.por_dia ?? []).map(d => d.ingresos))

  return (
    <div className="space-y-4">
      {/* Filtros y resumen */}
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="block text-xs text-gray-500 mb-1">Desde</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inp} />
        </label>
        <label>
          <span className="block text-xs text-gray-500 mb-1">Hasta</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inp} />
        </label>
        <div className="flex gap-1.5">
          <button onClick={() => { setFrom(hace(6)); setTo(hoy()) }}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">7 días</button>
          <button onClick={() => { setFrom(hace(29)); setTo(hoy()) }}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">30 días</button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar nombre, documento o correo…"
          className={`${inp} ml-auto w-72`} />
      </div>

      {data && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm text-green-700">
            <Wifi className="w-4 h-4" /> <b>{data.conectados.length}</b> conectados ahora
          </span>
          <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-800">
            <LogIn className="w-4 h-4" /> <b>{data.resumen.ingresos_7d}</b> ingresos · 7 días
          </span>
          <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-800">
            <Users className="w-4 h-4" /> <b>{data.resumen.estudiantes_7d}</b> estudiantes · 7 días
          </span>
          <span className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-600">
            <LogIn className="w-4 h-4" /> <b>{data.resumen.ingresos_30d}</b> ingresos · 30 días
          </span>
          <span className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-600">
            <Users className="w-4 h-4" /> <b>{data.resumen.estudiantes_30d}</b> estudiantes · 30 días
          </span>
        </div>
      )}

      {loading && !data && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {/* Conectados ahora */}
      {data && data.conectados.length > 0 && (
        <div className="bg-white border border-green-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2.5 border-b border-green-100 bg-green-50 text-sm font-semibold text-green-800">
            🟢 Conectados ahora ({data.conectados.length})
          </p>
          <div className="p-3 flex flex-wrap gap-2">
            {data.conectados.map(c => (
              <span key={c.student_id} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 text-sm"
                title={`${c.email} · último latido ${flocal(c.last_seen)}`}>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-gray-800">{c.name ?? c.email}</span>
                {c.document && <span className="text-xs text-gray-400">{c.document}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Serie por día */}
      {data && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-800">
            Ingresos por día — {fdia(data.from)} a {fdia(data.to)}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2 w-28">Día</th>
                <th className="text-left px-4 py-2">Ingresos</th>
                <th className="text-right px-4 py-2 w-24">Total</th>
                <th className="text-right px-4 py-2 w-28">Estudiantes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.por_dia.map(d => (
                <tr key={d.dia} className="hover:bg-gray-50/50">
                  <td className="px-4 py-1.5 text-gray-600">{fdia(d.dia)}</td>
                  <td className="px-4 py-1.5">
                    <div className="h-3.5 rounded bg-blue-500/80" style={{ width: `${Math.max(d.ingresos / maxDia * 100, d.ingresos ? 2 : 0)}%` }} />
                  </td>
                  <td className="px-4 py-1.5 text-right font-semibold text-gray-900">{d.ingresos || <span className="text-gray-300">0</span>}</td>
                  <td className="px-4 py-1.5 text-right text-gray-500">{d.estudiantes || <span className="text-gray-300">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Últimos ingresos del rango */}
      {data && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <p className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-800">
            Ingresos del rango ({data.rows.length}{data.rows.length === 300 ? ' — primeros 300' : ''})
          </p>
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Fecha y hora</th>
                <th className="text-left px-4 py-3">Estudiante</th>
                <th className="text-left px-4 py-3">Documento</th>
                <th className="text-left px-4 py-3">Correo usado</th>
                <th className="text-left px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin ingresos registrados{q ? ' para esa búsqueda' : ' en el rango'}.</td></tr>
              )}
              {data.rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-600">{flocal(r.logged_at)}</td>
                  <td className="px-4 py-2.5 text-gray-800">{r.name ?? <span className="text-gray-400">(no identificado)</span>}</td>
                  <td className="px-4 py-2.5 text-gray-500">{r.document ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.email}</td>
                  <td className="px-4 py-2.5 text-gray-400">{r.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Cada ingreso es un canje exitoso del enlace de acceso. &quot;Conectados ahora&quot; = latido del portal en los últimos 3 minutos (se refresca solo cada minuto).
      </p>
    </div>
  )
}
