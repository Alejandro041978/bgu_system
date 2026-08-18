'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, Search, Download } from 'lucide-react'

type Clase = 'no_registrado' | 'suma_distinta' | 'partido'

interface Caso {
  giro: string
  flywire: number
  erp: number
  diferencia: number
  filas: number
  clase: Clase
  student_id: string | null
  nombre: string
  documento: string | null
  fecha: string | null
  pagador: string | null
  accion: string
}
interface Data {
  giros_conocidos: number
  giros_en_el_erp: number
  cuadran: number
  repartidos_ok: number
  por_clase: Record<Clase, number>
  dinero_por_clase: Record<Clase, number>
  resueltos_a_mano: number
  falta_dinero: number
  sobra_dinero: number
  casos: Caso[]
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const CLASES: { k: Clase; etiqueta: string; explica: string; color: string }[] = [
  { k: 'no_registrado', etiqueta: 'Entregado y no registrado', color: 'bg-red-50 text-red-700 border-red-200',
    explica: 'Flywire entregó el dinero y en el ERP no hay ningún pago con esa referencia. Es lo único que no está en ninguna otra bandeja.' },
  { k: 'suma_distinta', etiqueta: 'Importe distinto', color: 'bg-amber-50 text-amber-800 border-amber-200',
    explica: 'El pago existe pero por un importe que no es el que llegó. Se suman los abonos, así que repartir un giro con el distribuidor no cuenta como desvío.' },
  { k: 'partido', etiqueta: 'Partido sin enlazar', color: 'bg-blue-50 text-blue-700 border-blue-200',
    explica: 'La suma cuadra, pero el giro está en varias filas y alguna no lleva la referencia de Flywire, solo el texto. Es forma, no dinero.' },
]

const ACCION_COLOR: Record<string, string> = {
  'Admisión': 'bg-blue-50 text-blue-700',
  'Cobranzas': 'bg-amber-50 text-amber-800',
  'Sistemas': 'bg-gray-100 text-gray-600',
}

export function FlywireAudit() {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clase, setClase] = useState<Clase | 'todas'>('no_registrado')
  const [anio, setAnio] = useState('todos')
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/finance/flywire-audit').then(r => r.json())
      .then(j => j.error ? setError(j.error) : setD(j))
      .catch(() => setError('No se pudo cargar'))
  }, [])

  const anios = useMemo(() => {
    const s = new Set<string>()
    for (const c of d?.casos ?? []) if (c.fecha) s.add(c.fecha.slice(0, 4))
    return [...s].sort().reverse()
  }, [d])

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (d?.casos ?? []).filter(c =>
      (clase === 'todas' || c.clase === clase) &&
      (anio === 'todos' || (c.fecha ?? '').slice(0, 4) === anio) &&
      (!t || c.giro.toLowerCase().includes(t) || c.nombre.toLowerCase().includes(t) ||
        (c.pagador ?? '').toLowerCase().includes(t) || (c.documento ?? '').includes(t)),
    )
  }, [d, clase, anio, q])

  const descargar = () => {
    const cab = ['giro', 'fecha', 'clase', 'flywire', 'erp', 'diferencia', 'filas', 'pagador', 'documento', 'estudiante', 'accion']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const txt = [cab.join(','), ...filas.map(c => [c.giro, c.fecha, c.clase, c.flywire, c.erp, c.diferencia,
      c.filas, c.pagador, c.documento, c.nombre, c.accion].map(esc).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
    a.download = `flywire-cuadre-${clase}-${anio}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (error) return <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</p>
  if (!d) return (
    <div className="py-20 text-center">
      <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
      <p className="text-xs text-gray-400 mt-3">Contrastando cada giro entregado contra el estado de cuenta…</p>
    </div>
  )

  const pendientes = d.por_clase.no_registrado + d.por_clase.suma_distinta + d.por_clase.partido

  return (
    <div className="space-y-4">
      {/* Lo primero es el veredicto: cuánto de lo entregado está bien puesto. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-[11px] text-gray-500">Giros entregados</p>
          <p className="text-lg font-bold text-gray-900">{d.giros_conocidos.toLocaleString('es')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-[11px] text-gray-500">Cuadran exactos</p>
          <p className="text-lg font-bold text-green-700">{d.cuadran.toLocaleString('es')}</p>
          <p className="text-[11px] text-gray-400">{((d.cuadran / Math.max(1, d.giros_conocidos)) * 100).toFixed(2)}%</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-[11px] text-gray-500">Resueltos a mano</p>
          <p className="text-lg font-bold text-gray-900">{d.resueltos_a_mano.toLocaleString('es')}</p>
          <p className="text-[11px] text-gray-400">descartados o a Otros Ingresos</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-[11px] text-gray-500">Por revisar</p>
          <p className="text-lg font-bold text-amber-700">{pendientes.toLocaleString('es')}</p>
        </div>
      </div>

      {/* Las tres clases, como pestañas: cada una es un trabajo distinto. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CLASES.map(c => {
          const activa = clase === c.k
          return (
            <button key={c.k} onClick={() => setClase(activa ? 'todas' : c.k)}
              className={`text-left rounded-xl border px-4 py-3 transition ${activa ? c.color + ' ring-2 ring-offset-1 ring-gray-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium">{c.etiqueta}</p>
                <p className="text-lg font-bold tabular-nums">{d.por_clase[c.k]}</p>
              </div>
              <p className="text-[11px] mt-0.5 opacity-70">
                {c.k === 'partido' ? 'sin dinero en juego' : `${money(d.dinero_por_clase[c.k])} en juego`}
              </p>
              <p className="text-[11px] mt-1.5 opacity-60 leading-snug">{c.explica}</p>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Giro, pagador, documento o estudiante…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <select value={anio} onChange={e => setAnio(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="todos">Todos los años</option>
          {anios.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={descargar} disabled={!filas.length}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40">
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      {!filas.length ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Nada que revisar con este filtro.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 w-24">Fecha</th>
                  <th className="text-left px-3 py-2.5 w-36">Giro</th>
                  <th className="text-left px-3 py-2.5">Pagador</th>
                  <th className="text-left px-3 py-2.5">Estudiante</th>
                  <th className="text-right px-3 py-2.5 w-24">Flywire</th>
                  <th className="text-right px-3 py-2.5 w-24">ERP</th>
                  <th className="text-right px-3 py-2.5 w-24">Diferencia</th>
                  <th className="text-left px-3 py-2.5 w-28">Resuelve</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filas.map(c => (
                  <tr key={c.giro} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{c.fecha ?? '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{c.giro}</td>
                    <td className="px-3 py-2.5">
                      <p className="text-gray-800">{c.pagador ?? '—'}</p>
                      {c.documento && <p className="text-[11px] text-gray-400">{c.documento}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.student_id ? (
                        <a href={`/academic/account?student=${c.student_id}`} target="_blank" rel="noreferrer"
                          className="text-blue-600 hover:underline">{c.nombre}</a>
                      ) : <span className="text-gray-400 text-xs">{c.nombre}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-800">{money(c.flywire)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                      {money(c.erp)}
                      {c.filas > 1 && <span className="text-[11px] text-gray-400 ml-1">({c.filas})</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                      c.diferencia > 0.01 ? 'text-red-600' : c.diferencia < -0.01 ? 'text-blue-600' : 'text-gray-300'}`}>
                      {Math.abs(c.diferencia) < 0.01 ? '—' : `${c.diferencia > 0 ? '+' : ''}${money(c.diferencia).replace('$', '')}`}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACCION_COLOR[c.accion] ?? 'bg-gray-100 text-gray-600'}`}>{c.accion}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-gray-400">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
        Solo se exige lo <strong className="font-medium">entregado</strong>: un giro caducado o cancelado no es dinero que
        haya llegado. Una diferencia en positivo significa que Flywire entregó más de lo que el ERP tiene registrado;
        en negativo, que el ERP tiene de más. Lo que ocurra después con ese dinero —a qué cuota se aplica, si sobra o
        falta para cubrirla— es trabajo de Cobranzas y no se observa aquí.
      </p>
    </div>
  )
}
