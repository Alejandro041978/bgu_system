'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Play, Download, User, Wallet, Mail, Phone, GraduationCap } from 'lucide-react'

interface Fila {
  student_id: string
  nombre: string; documento: string | null
  deuda_vencida: number; cuotas_vencidas: number; vencida_desde: string | null
  programa: string; situacion: string | null
  email_personal: string | null; email_institucional: string | null; telefono: string | null
  ultimo_acceso_campus: string | null; campus_suspendido: boolean | null
  ultimo_acceso_correo: string | null; correo_en_directorio: boolean
}
interface Data {
  categorias: { id: string; name: string }[]
  filas: Fila[] | null
  total?: number
  suma_vencida?: number
  fuentes?: { moodle: boolean; correo: boolean }
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const dia = (s: string | null) => s ? new Date(s).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

// Cuánto hace del último acceso. El dato crudo dice poco; lo que decide una
// llamada es si esta persona sigue apareciendo por el campus o desapareció.
function hace(s: string | null): { texto: string; tono: string } {
  if (!s) return { texto: 'nunca', tono: 'text-rose-600' }
  const dias = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (dias <= 7) return { texto: dias <= 1 ? 'hoy' : `hace ${dias} días`, tono: 'text-emerald-700' }
  if (dias <= 30) return { texto: `hace ${dias} días`, tono: 'text-gray-600' }
  if (dias <= 90) return { texto: `hace ${Math.floor(dias / 30)} meses`, tono: 'text-amber-700' }
  return { texto: `hace ${Math.floor(dias / 30)} meses`, tono: 'text-rose-600' }
}

// Cómo se llama cada situación en la pantalla. IW y LOA entre paréntesis porque
// es como los nombra Registros, y "retiro permanente" no siempre se reconoce.
const SITUACION: Record<string, string> = {
  activo: 'Activo',
  retiro_permanente: 'Retiro permanente (IW)',
  retiro_temporal: 'Retiro temporal (LOA)',
  egresado: 'Egresado',
  campus_socio: 'Campus socio',
  '—': 'Sin situación',
}

export function DebtorsList() {
  const [d, setD] = useState<Data | null>(null)
  const [categoria, setCategoria] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Situaciones ocultas. Se filtra sobre lo ya cargado: cambiar de idea no
  // debería costar otra consulta a Moodle y al directorio de correo.
  const [ocultas, setOcultas] = useState<Set<string>>(new Set())

  const catalogo = useCallback(async () => {
    const r = await fetch('/api/finance/debtors').then(x => x.json()).catch(() => null)
    if (r) setD(r)
  }, [])
  useEffect(() => { catalogo() }, [catalogo])

  async function generar() {
    if (!categoria) return
    setCargando(true); setError(null)
    const r = await fetch(`/api/finance/debtors?category=${encodeURIComponent(categoria)}`)
    const j = await r.json().catch(() => ({ error: 'Error de red' }))
    setCargando(false)
    if (!r.ok || j.error) { setError(j.error ?? 'No se pudo generar'); return }
    setOcultas(new Set())
    setD(j)
  }

  // Composición por situación, sobre TODO lo cargado: las cuentas de los chips
  // no cambian al filtrar, porque son lo que hay, no lo que se ve.
  const porSituacion = new Map<string, { n: number; monto: number }>()
  for (const f of d?.filas ?? []) {
    const k = f.situacion ?? '—'
    const a = porSituacion.get(k) ?? { n: 0, monto: 0 }
    porSituacion.set(k, { n: a.n + 1, monto: a.monto + f.deuda_vencida })
  }
  const visibles = (d?.filas ?? []).filter(f => !ocultas.has(f.situacion ?? '—'))
  const sumaVisible = visibles.reduce((s, f) => s + f.deuda_vencida, 0)

  function alternar(k: string) {
    setOcultas(prev => {
      const s = new Set(prev)
      if (s.has(k)) s.delete(k); else s.add(k)
      return s
    })
  }

  function exportar() {
    if (!visibles.length) return
    const cab = ['Estudiante', 'Documento', 'Deuda vencida', 'Cuotas', 'Vencida desde', 'Programa', 'Situación',
      'Correo personal', 'Correo institucional', 'Teléfono', 'Último acceso campus', 'Último acceso correo']
    const linea = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cab.map(linea).join(',')].concat(visibles.map(f => [
      f.nombre, f.documento, f.deuda_vencida, f.cuotas_vencidas, f.vencida_desde, f.programa, f.situacion,
      f.email_personal, f.email_institucional, f.telefono,
      f.ultimo_acceso_campus ? dia(f.ultimo_acceso_campus) : 'nunca',
      f.ultimo_acceso_correo ? dia(f.ultimo_acceso_correo) : (f.correo_en_directorio ? 'nunca' : 'sin cuenta'),
    ].map(linea).join(','))).join('\n')
    const nombre = d?.categorias.find(c => c.id === categoria)?.name ?? 'deudores'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `deudores-${nombre.toLowerCase().replace(/\s+/g, '-')}.csv`
    a.click()
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm text-gray-600 leading-relaxed">
          Estudiantes con deuda <strong>ya vencida</strong>, por cualquier concepto. Es una vara distinta de la
          del restrictor de Moodle, que solo mira matrícula: aquí está todo lo exigible y no pagado, porque la
          pregunta es a quién cobrarle, no a quién cortarle el aula.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <select value={categoria} onChange={e => setCategoria(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[280px]">
            <option value="">Elige una categoría de programa…</option>
            {(d?.categorias ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={generar} disabled={!categoria || cargando}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
            {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Generar
          </button>
          {!!visibles.length && (
            <button onClick={exportar}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
              <Download className="w-4 h-4" /> Excel
            </button>
          )}
        </div>
        {cargando && (
          <p className="text-xs text-gray-400 mt-2">
            Consultando el campus y el directorio de correo — puede tardar unos segundos.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

      {d?.filas && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{visibles.length}</p>
              <p className="text-xs text-gray-500">
                Deudores en la lista
                {ocultas.size > 0 && <span className="block text-[11px] text-gray-400">de {d.total} en la categoría</span>}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-2xl font-bold text-rose-600 tabular-nums">{money(sumaVisible)}</p>
              <p className="text-xs text-gray-500">
                Deuda vencida acumulada
                {ocultas.size > 0 && <span className="block text-[11px] text-gray-400">de {money(d.suma_vencida ?? 0)} en total</span>}
              </p>
            </div>
            {/* Si una fuente externa no respondió, se dice: una columna vacía y
                una columna sin datos se parecen demasiado. */}
            {d.fuentes && !d.fuentes.moodle && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-4 py-3 self-center">Moodle no respondió: la columna de acceso al campus va vacía.</p>
            )}
            {d.fuentes && !d.fuentes.correo && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-4 py-3 self-center">El directorio de correo no respondió: esa columna va vacía.</p>
            )}
          </div>

          {/* Filtro por situación. Nace con todo visible a propósito: el total
              debe cuadrar con el Reporte de Deuda antes de que nadie empiece a
              descartar. Quitar a los retirados es una decisión de prioridad, y
              se ve cuánta deuda se está apartando al tomarla. */}
          {porSituacion.size > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-2">
                Situación del estudiante — quita las que no vas a gestionar ahora
              </p>
              <div className="flex flex-wrap gap-2">
                {[...porSituacion].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => {
                  const off = ocultas.has(k)
                  return (
                    <button key={k} onClick={() => alternar(k)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${off
                        ? 'bg-gray-50 text-gray-300 border-gray-200 line-through'
                        : k === 'activo'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {SITUACION[k] ?? k.replace(/_/g, ' ')} · {v.n} · {money(v.monto)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Estudiante</th>
                    <th className="text-right px-3 py-2 font-medium">Vencido</th>
                    <th className="text-left px-3 py-2 font-medium">Programa</th>
                    <th className="text-left px-3 py-2 font-medium">Contacto</th>
                    <th className="text-left px-3 py-2 font-medium">Último acceso</th>
                    <th className="text-center px-3 py-2 font-medium w-24">Ver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibles.map(f => {
                    const campus = hace(f.ultimo_acceso_campus)
                    const correo = f.correo_en_directorio ? hace(f.ultimo_acceso_correo) : { texto: 'sin cuenta', tono: 'text-gray-300' }
                    return (
                      <tr key={f.student_id} className="hover:bg-gray-50/60 align-top">
                        <td className="px-3 py-2.5">
                          <p className="text-gray-800">{f.nombre}</p>
                          <p className="text-[11px] text-gray-400">
                            {f.documento ?? '—'}{f.situacion && f.situacion !== 'activo' ? ` · ${f.situacion.replace(/_/g, ' ')}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <p className="font-semibold text-rose-600 tabular-nums">{money(f.deuda_vencida)}</p>
                          <p className="text-[11px] text-gray-400">
                            {f.cuotas_vencidas} cuota{f.cuotas_vencidas === 1 ? '' : 's'}
                            {f.vencida_desde ? ` · desde ${dia(f.vencida_desde)}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[220px]">{f.programa}</td>
                        <td className="px-3 py-2.5 text-[11px] text-gray-500 space-y-0.5">
                          {f.email_personal && <p className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-300 shrink-0" />{f.email_personal}</p>}
                          {f.email_institucional && <p className="flex items-center gap-1"><GraduationCap className="w-3 h-3 text-gray-300 shrink-0" />{f.email_institucional}</p>}
                          {f.telefono && <p className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-300 shrink-0" />{f.telefono}</p>}
                          {!f.email_personal && !f.email_institucional && !f.telefono && <span className="text-gray-300">sin contacto</span>}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] space-y-0.5 whitespace-nowrap">
                          <p className={campus.tono}>campus: {campus.texto}{f.campus_suspendido ? ' · suspendido' : ''}</p>
                          <p className={correo.tono}>correo: {correo.texto}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <a href={`/academic/students?id=${f.student_id}`} target="_blank" rel="noreferrer"
                              title="Ficha del estudiante"
                              className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"><User className="w-3.5 h-3.5" /></a>
                            <a href={`/academic/account?student=${f.student_id}`} target="_blank" rel="noreferrer"
                              title="Estado de cuenta"
                              className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Wallet className="w-3.5 h-3.5" /></a>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!visibles.length && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">Ningún estudiante visible con los filtros actuales.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
