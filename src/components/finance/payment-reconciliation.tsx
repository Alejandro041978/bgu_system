'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, ShieldCheck, ShieldAlert, HelpCircle } from 'lucide-react'

interface Disc { nombre: string; doc: string; ref: string; fly: string; cruda: string; monto: number; fecha: string }
interface Orphan { nombre: string; doc: string; ref: string; cruda: string; monto: number; fecha: string }
interface Legacy { student_id: string; nombre: string; doc: string; ref: string; cruda: string; monto: number; fecha: string; cuota: string; candidato: 'flywire' | 'books' }
interface Stats { total: number; activa: number; enriquecidos: number; flywire_nuevos: number; coincide: number; disc: number; orphan: number; legacy: number; legacy_flywire: number; legacy_books: number; legacy_sum: number }
interface Data { stats: Stats; disc: Disc[]; orphan: Orphan[]; legacy: Legacy[] }

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fdate = (d: string) => (d ? String(d).split('-').reverse().join('/') : '—')
const num = (n: number) => n.toLocaleString('es-PE')

export function PaymentReconciliation() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/finance/reconciliation').then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setData(d)
      setLoading(false)
    }).catch(() => { setError('No se pudo cargar'); setLoading(false) })
  }, [])

  const t = q.trim().toLowerCase()
  const match = (s: string) => !t || s.toLowerCase().includes(t)
  const disc = useMemo(() => (data?.disc ?? []).filter(r => match(`${r.nombre} ${r.doc} ${r.ref} ${r.fly} ${r.cruda}`)), [data, t])
  const orphan = useMemo(() => (data?.orphan ?? []).filter(r => match(`${r.nombre} ${r.doc} ${r.ref} ${r.cruda}`)), [data, t])
  const legacy = useMemo(() => (data?.legacy ?? []).filter(r => match(`${r.nombre} ${r.doc} ${r.ref} ${r.cruda}`)), [data, t])

  if (loading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /><p className="text-xs text-gray-400 mt-2">Analizando {`>`}15,000 pagos…</p></div>
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
  if (!data) return null
  const s = data.stats
  const pct = s.coincide + s.disc > 0 ? ((s.coincide / (s.coincide + s.disc)) * 100).toFixed(2) : '100.00'

  return (
    <div className="space-y-5">
      {/* Salud */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-wrap items-center gap-6">
        <div>
          <p className={`text-4xl font-bold tabular-nums ${s.disc === 0 ? 'text-green-600' : 'text-amber-600'}`}>{pct}%</p>
          <p className="text-xs text-gray-500 mt-1">del cruce de ZBL coincide</p>
        </div>
        <p className="text-sm text-gray-500 max-w-lg">
          De las filas con ZBL en ambos lados, <b className="text-gray-800">{num(s.coincide)}</b> coinciden y <b className="text-gray-800">{s.disc}</b> discrepan.
          Aparte, <b className="text-gray-800">{s.orphan}</b> ZBL de SystemActiva no existen en ninguna importación de Flywire.
        </p>
      </div>

      {/* Objetivo de migración: pagos legacy sin respaldo de importación */}
      <div className="bg-white border border-blue-200 rounded-xl p-5 flex flex-wrap items-center gap-6">
        <div>
          <p className={`text-4xl font-bold tabular-nums ${s.legacy === 0 ? 'text-green-600' : 'text-blue-600'}`}>{num(s.legacy)}</p>
          <p className="text-xs text-gray-500 mt-1">pagos legacy por migrar · <b className="text-gray-700">{money(s.legacy_sum)}</b></p>
        </div>
        <p className="text-sm text-gray-500 max-w-lg">
          Pagos que aún <b className="text-gray-800">no tienen respaldo de importación</b> (ni serie FLYWIRE/BOOKS, ni <span className="font-mono">flywire_payment_id</span>).
          De ellos, <b className="text-emerald-700">{num(s.legacy_flywire)}</b> traen un ZBL (candidatos a <b>Flywire</b>) y <b className="text-indigo-700">{num(s.legacy_books)}</b> no (candidatos a <b>Books</b> o revisión manual).
        </p>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Pagos totales', num(s.total), ''],
          ['Confirmados por Flywire', num(s.enriquecidos), 'ZBL enriqueció'],
          ['Creados por Flywire', num(s.flywire_nuevos), 'series FLYWIRE'],
          ['Legacy → Flywire', num(s.legacy_flywire), 'traen ZBL'],
          ['Legacy → Books', num(s.legacy_books), 'sin ZBL'],
        ].map(([l, n, sub]) => (
          <div key={l as string} className="bg-white border border-gray-200 rounded-xl p-3.5">
            <p className="text-xl font-bold tabular-nums text-gray-900">{n}</p>
            <p className="text-[11px] text-gray-500 mt-0.5"><b className="text-gray-700">{l}</b>{sub ? ` · ${sub}` : ''}</p>
          </div>
        ))}
      </div>

      {/* Buscador */}
      <div className="sticky top-0 z-10 py-1 bg-gray-50/80 backdrop-blur">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, documento o código ZBL…"
            className="flex-1 text-sm focus:outline-none" />
          {t && <span className="text-[11px] text-gray-400 whitespace-nowrap">{disc.length + orphan.length + legacy.length} coincidencia(s)</span>}
        </div>
      </div>

      {/* Discrepancias */}
      <Section icon={<ShieldAlert className="w-4 h-4 text-red-500" />} rail="bg-red-500" count={disc.length}
        title="Discrepancias de ZBL" desc="El ZBL de la referencia de SystemActiva no coincide con el ZBL que Flywire guardó en la misma fila.">
        {disc.length === 0 ? <Empty text="Sin discrepancias. Todos los ZBL con contraparte coinciden. 🎉" /> : (
          <table className="w-full text-sm">
            <thead><HeadRow cols={['Estudiante', 'ZBL referencia (Activa)', 'ZBL de Flywire', 'Referencia cruda', 'Monto', 'Fecha']} right={[4]} /></thead>
            <tbody className="divide-y divide-gray-100">
              {disc.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50/50">
                  <Who r={r} />
                  <td className="px-3 py-2 font-mono text-xs text-red-600">{r.ref}</td>
                  <td className="px-3 py-2 font-mono text-xs text-green-700">{r.fly}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-gray-400">{r.cruda}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono">{money(r.monto)}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">{fdate(r.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Huérfanos */}
      <Section icon={<HelpCircle className="w-4 h-4 text-amber-500" />} rail="bg-amber-500" count={orphan.length}
        title="ZBL de SystemActiva sin importación Flywire" desc="Pagos con un ZBL que Flywire nunca trajo en ningún CSV (cargas manuales, pagos partidos o typos).">
        {orphan.length === 0 ? <Empty text="Ninguno." /> : (
          <table className="w-full text-sm">
            <thead><HeadRow cols={['Estudiante', 'ZBL', 'Referencia cruda', 'Monto', 'Fecha']} right={[3]} /></thead>
            <tbody className="divide-y divide-gray-100">
              {orphan.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50/50">
                  <Who r={r} />
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.ref}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-gray-400">{r.cruda}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono">{money(r.monto)}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">{fdate(r.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Legacy: pendientes de migrar a Books o Flywire */}
      <Section icon={<ShieldCheck className="w-4 h-4 text-blue-500" />} rail="bg-blue-500" count={legacy.length}
        title="Pagos legacy de SystemActiva (pendientes de migrar)" desc="Sin respaldo de importación: hay que reemplazarlos por un pago con base en Flywire (ZBL) o Books. El enlace abre el estado de cuenta del estudiante.">
        {legacy.length === 0 ? <Empty text="Ninguno. Todos los pagos tienen respaldo de importación. 🎉" /> : (
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0"><HeadRow cols={['Estudiante', 'Candidato', 'ZBL', 'Referencia cruda', 'Monto', 'Fecha', 'Cuota']} right={[4]} /></thead>
              <tbody className="divide-y divide-gray-100">
                {legacy.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2">
                      <a href={`/academic/account?student=${r.student_id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.nombre}</a>
                      <span className="block text-[11px] text-gray-400 font-mono">{r.doc}</span>
                    </td>
                    <td className="px-3 py-2">
                      {r.candidato === 'flywire'
                        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">Flywire</span>
                        : <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">Books</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.ref || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-gray-400 max-w-56 truncate" title={r.cruda}>{r.cruda || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono">{money(r.monto)}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">{fdate(r.fecha)}</td>
                    <td className="px-3 py-2"><span className="text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-500">{r.cuota === 'sí' ? 'enlazada' : 'sin cuota'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="text-[11px] text-gray-400">
        Legacy = pagos sin serie FLYWIRE/BOOKS/DESCUENTO y sin <span className="font-mono">flywire_payment_id</span>. Candidato «Flywire» si la referencia trae un <span className="font-mono">/ZBL\d+/</span>, «Books» si no. {num(s.total)} pagos analizados.
      </p>
    </div>
  )
}

function Section({ icon, rail, count, title, desc, children }: { icon: React.ReactNode; rail: string; count: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full tabular-nums">{icon}{count}</span>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <p className="text-xs text-gray-500 flex-1 min-w-[220px]">{desc}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex">
        <span className={`w-1 ${rail}`} />
        <div className="flex-1 min-w-0 overflow-x-auto">{children}</div>
      </div>
    </section>
  )
}
function HeadRow({ cols, right = [] as number[] }: { cols: string[]; right?: number[] }) {
  return (
    <tr className="bg-gray-50 text-gray-500 text-[10.5px] uppercase tracking-wide">
      {cols.map((c, i) => <th key={i} className={`px-3 py-2 font-semibold whitespace-nowrap ${right.includes(i) ? 'text-right' : 'text-left'}`}>{c}</th>)}
    </tr>
  )
}
function Who({ r }: { r: { nombre: string; doc: string } }) {
  return (
    <td className="px-3 py-2">
      <span className="text-gray-800">{r.nombre}</span>
      <span className="block text-[11px] text-gray-400 font-mono">{r.doc}</span>
    </td>
  )
}
function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-xs text-gray-400">{text}</p>
}
