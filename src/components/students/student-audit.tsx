'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search, RefreshCw, Download, ShieldAlert } from 'lucide-react'

interface Cambio {
  id: string
  student_id: string
  document_number: string | null
  student_name: string | null
  field: string
  etiqueta: string
  old_value: string | null
  new_value: string | null
  action: string
  autor: string | null
  externo: boolean
  db_role: string | null
  changed_at: string
}

const CAMPOS = [
  { v: '', n: 'Todos los campos' },
  { v: 'email', n: 'Correo personal' },
  { v: 'email_alt', n: 'Correo institucional' },
  { v: 'document_number', n: 'Documento' },
  { v: 'situation', n: 'Situación' },
  { v: 'disabled', n: 'Deshabilitado' },
  { v: 'first_name', n: 'Nombres' },
  { v: 'last_name', n: 'Primer apellido' },
]

const fecha = (s: string) => new Date(s).toLocaleString('es', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
})

export function StudentAudit() {
  const [cambios, setCambios] = useState<Cambio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [campo, setCampo] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const url = `/api/students/audit?limit=500${campo ? `&field=${campo}` : ''}`
      const r = await fetch(url)
      const d = await r.json().catch(() => ({ error: `El servidor respondió ${r.status}` }))
      if (!r.ok || d.error) { setError(d.error ?? 'Error'); return }
      setCambios(d.cambios ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally { setLoading(false) }
  }, [campo])
  useEffect(() => { load() }, [load])

  const filtrados = cambios.filter(c => {
    if (!q.trim()) return true
    const t = q.trim().toLowerCase()
    return [c.student_name, c.document_number, c.autor, c.old_value, c.new_value, c.etiqueta]
      .some(v => String(v ?? '').toLowerCase().includes(t))
  })

  function exportar() {
    const cab = ['Cuándo', 'Estudiante', 'Documento', 'Campo', 'Antes', 'Después', 'Quién', 'Origen']
    const cita = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cab.map(cita).join(',')].concat(filtrados.map(c => [
      fecha(c.changed_at), c.student_name, c.document_number, c.etiqueta,
      c.old_value, c.new_value, c.autor ?? '—', c.externo ? 'fuera del ERP' : 'ERP',
    ].map(cita).join(','))).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'cambios-fichas.csv'
    a.click()
  }

  const externos = filtrados.filter(c => c.externo).length

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm text-gray-600 leading-relaxed">
          Todo cambio en una ficha queda aquí: qué campo, qué decía antes, qué dice ahora y quién lo hizo.
          Lo registra la base de datos, no la aplicación — así también quedan los cambios hechos desde N8N,
          desde la consola de Supabase o con SQL a mano, que son los que nadie recuerda haber hecho.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Nace del 14 de agosto de 2026: dos fichas tenían el correo cambiado y no había manera de saber
          por quién. Un cambio de correo puede dejar a un estudiante fuera de su portal, así que conviene
          poder responderlo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar por estudiante, documento, valor o autor…"
            className="w-full px-2 py-2 text-sm outline-none" />
        </div>
        <select value={campo} onChange={e => setCampo(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
          {CAMPOS.map(c => <option key={c.v} value={c.v}>{c.n}</option>)}
        </select>
        <button onClick={load} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 px-2">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
        {!!filtrados.length && (
          <button onClick={exportar} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 px-2">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        )}
      </div>

      {externos > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-xl flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          {externos} {externos === 1 ? 'cambio no salió' : 'cambios no salieron'} del ERP: los hizo una integración
          o alguien directamente contra la base.
        </p>
      )}

      {loading && !cambios.length ? (
        <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
      ) : !filtrados.length ? (
        <p className="text-sm text-gray-500 bg-gray-50 px-4 py-3 rounded-xl">
          Sin cambios registrados todavía. El registro empieza a llenarse desde que se instala.
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Cuándo</th>
                  <th className="text-left px-3 py-2 font-medium">Estudiante</th>
                  <th className="text-left px-3 py-2 font-medium">Campo</th>
                  <th className="text-left px-3 py-2 font-medium">Antes → Después</th>
                  <th className="text-left px-3 py-2 font-medium">Quién</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/60 align-top">
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fecha(c.changed_at)}</td>
                    <td className="px-3 py-2.5">
                      <p className="text-gray-800">{c.student_name || '—'}</p>
                      <p className="text-[11px] text-gray-400">{c.document_number || '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{c.etiqueta}</td>
                    <td className="px-3 py-2.5 max-w-[420px]">
                      {c.field === '*' ? (
                        <span className="text-xs text-gray-500">{c.action === 'insert' ? 'Alta de la ficha' : 'Baja de la ficha'}</span>
                      ) : (
                        <div className="text-xs">
                          <span className="text-red-700 line-through break-all">{c.old_value ?? '(vacío)'}</span>
                          <span className="text-gray-400 mx-1.5">→</span>
                          <span className="text-green-800 break-all">{c.new_value ?? '(vacío)'}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {c.externo ? (
                        <span className="text-amber-700">fuera del ERP{c.db_role ? ` · ${c.db_role}` : ''}</span>
                      ) : (
                        <span className="text-gray-600 break-all">{c.autor}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
