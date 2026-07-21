'use client'

import { useEffect, useState } from 'react'
import { Loader2, Users, LogIn } from 'lucide-react'

interface Row { id: string; logged_at: string; email: string; ip: string | null; name: string | null; document: string | null }
interface Data {
  resumen: { ingresos_7d: number; ingresos_30d: number; estudiantes_7d: number; estudiantes_30d: number }
  rows: Row[]
}

const flocal = (iso: string) => new Date(iso).toLocaleString('es-PE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export function PortalLoginsReport() {
  const [data, setData] = useState<Data | null>(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/reports/portal-logins?q=${encodeURIComponent(q)}`)
        .then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false) })
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {data && (
          <>
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
          </>
        )}
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar nombre, documento o correo…"
          className="ml-auto border border-gray-200 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {loading && !data && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>}

      {data && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
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
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin ingresos registrados{q ? ' para esa búsqueda' : ' todavía'}.</td></tr>
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
        Cada fila es un canje exitoso del enlace de acceso (la puerta real del portal). Los resúmenes cuentan sobre los últimos 1000 ingresos.
      </p>
    </div>
  )
}
