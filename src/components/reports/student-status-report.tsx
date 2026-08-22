'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'

type R1 = { matriculados: number; titulados: number; egresados: number; retirados: number; activos: number }
type R2 = { activos: number; moodle: number; campus_socio: number; en_carrusel: number; sin_colocar: number; con_cuenta: number }
type R3 = {
  loa_total: number; loa_revertidos: number; loa_convertidos: number; loa_vigentes: number; loa_otros: number
  iw_total: number; iw_reentry: number; iw_reincorporados: number; iw_vigentes: number; iw_otros: number
  retirados_netos: number
}
type Row1 = R1 & { category: string; sigla: string }
type Row2 = R2 & { category: string; sigla: string }
type Row3 = R3 & { category: string; sigla: string }
type Data = { r1: { rows: Row1[]; total: R1 }; r2: { rows: Row2[]; total: R2 }; r3: R3 & { rows: Row3[] } }

const n = (v: number) => v.toLocaleString('es')

export function StudentStatusReport() {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/reports/student-status').then(r => r.json())
      .then(j => j.error ? setError(j.error) : setD(j))
      .catch(() => setError('No se pudo cargar'))
  }, [])

  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
  if (!d) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>

  // Las identidades se COMPRUEBAN, no se asumen: una fila que no cierra se
  // marca. R1 cierra por construcción; R3 depende de datos y puede delatar
  // estados imprevistos (columna "otros").
  const r3 = d.r3
  const r3Cierra = r3.retirados_netos === (r3.loa_total - r3.loa_revertidos - r3.loa_otros) + (r3.iw_total - r3.iw_reentry - r3.iw_reincorporados - r3.iw_otros)

  return (
    <div className="space-y-8">

      {/* ── R1 · Ciclo de vida ──────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">1 · Ciclo de vida</h2>
        <p className="text-[11px] text-gray-400">
          Activos = Matriculados − Titulados − Egresados − Retirados netos. La unidad es la matrícula
          (estudiante × programa). Campus socio no interviene: es una forma de estar activo.
        </p>
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Categoría</th>
                <th className="text-right px-4 py-3">Matriculados</th>
                <th className="text-right px-4 py-3">Titulados</th>
                <th className="text-right px-4 py-3">Egresados</th>
                <th className="text-right px-4 py-3">Retirados netos</th>
                <th className="text-right px-4 py-3">Activos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.r1.rows.map(r => (
                <tr key={r.category} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-700 font-medium" title={r.category}>{r.sigla}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{n(r.matriculados)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.titulados ? 'text-amber-700' : 'text-gray-300'}`}>{n(r.titulados)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.egresados ? 'text-blue-700' : 'text-gray-300'}`}>{n(r.egresados)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.retirados ? 'text-rose-700' : 'text-gray-300'}`}>{n(r.retirados)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${r.activos ? 'text-green-700' : 'text-gray-300'}`}>{n(r.activos)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-800">Total</td>
                <td className="px-4 py-3 text-right text-gray-900">{n(d.r1.total.matriculados)}</td>
                <td className="px-4 py-3 text-right text-amber-700">{n(d.r1.total.titulados)}</td>
                <td className="px-4 py-3 text-right text-blue-700">{n(d.r1.total.egresados)}</td>
                <td className="px-4 py-3 text-right text-rose-700">{n(d.r1.total.retirados)}</td>
                <td className="px-4 py-3 text-right text-green-700">{n(d.r1.total.activos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ── R2 · Dónde estudian los activos ─────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">2 · Dónde estudian los activos</h2>
        <p className="text-[11px] text-gray-400">
          Activos = Moodle (programas nuestros) + Campus socio. Del lado Moodle: en carrusel ya tienen su ruta;
          <b> sin colocar</b> es la lista de trabajo — deberían estar cursando y no tienen ruta asignada.
          &quot;Con cuenta&quot; mide el acceso al campus.
        </p>
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Categoría</th>
                <th className="text-right px-4 py-3">Activos</th>
                <th className="text-right px-4 py-3">Moodle</th>
                <th className="text-right px-4 py-3">Campus socio</th>
                <th className="text-right px-4 py-3">En carrusel</th>
                <th className="text-right px-4 py-3">Sin colocar</th>
                <th className="text-right px-4 py-3">Con cuenta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.r2.rows.map(r => (
                <tr key={r.category} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-700 font-medium" title={r.category}>{r.sigla}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-green-700">{n(r.activos)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.moodle ? 'text-indigo-700' : 'text-gray-300'}`}>{n(r.moodle)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.campus_socio ? 'text-violet-700' : 'text-gray-300'}`}>{n(r.campus_socio)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.en_carrusel ? 'text-cyan-700' : 'text-gray-300'}`}>{n(r.en_carrusel)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${r.sin_colocar ? 'text-amber-700' : 'text-gray-300'}`}>{n(r.sin_colocar)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.con_cuenta ? 'text-gray-600' : 'text-gray-300'}`}>{n(r.con_cuenta)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-800">Total</td>
                <td className="px-4 py-3 text-right text-green-700">{n(d.r2.total.activos)}</td>
                <td className="px-4 py-3 text-right text-indigo-700">{n(d.r2.total.moodle)}</td>
                <td className="px-4 py-3 text-right text-violet-700">{n(d.r2.total.campus_socio)}</td>
                <td className="px-4 py-3 text-right text-cyan-700">{n(d.r2.total.en_carrusel)}</td>
                <td className="px-4 py-3 text-right text-amber-700">{n(d.r2.total.sin_colocar)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{n(d.r2.total.con_cuenta)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ── R3 · Retirados ──────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">3 · Retirados</h2>
        <p className="text-[11px] text-gray-400">
          Retirados netos = (LOA − revertidos) + (IW − ReEntry − Reincorporados). La unidad es el retiro:
          un estudiante retirado con dos programas pesa 2 matrículas en el reporte 1 y 1 retiro aquí.
          <b> ReEntry</b> pagó su trámite de $35; <b>Reincorporado</b> es la reversión de la era sin cobro.
          La categoría de un retiro es la de la matrícula más reciente a la fecha del retiro.
        </p>
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Categoría</th>
                <th className="text-right px-4 py-3">LOA</th>
                <th className="text-right px-4 py-3">LOA revertidos</th>
                <th className="text-right px-4 py-3">LOA vigentes</th>
                <th className="text-right px-4 py-3">IW</th>
                <th className="text-right px-4 py-3">ReEntry</th>
                <th className="text-right px-4 py-3">Reincorporados</th>
                <th className="text-right px-4 py-3">IW vigentes</th>
                <th className="text-right px-4 py-3">Retirados netos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {r3.rows.map(r => (
                <tr key={r.category} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-700 font-medium" title={r.category}>{r.sigla}</td>
                  <td className={`px-4 py-2.5 text-right ${r.loa_total ? 'text-orange-700' : 'text-gray-300'}`}>{n(r.loa_total)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.loa_revertidos ? 'text-gray-600' : 'text-gray-300'}`}>{n(r.loa_revertidos)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${r.loa_vigentes ? 'text-orange-700' : 'text-gray-300'}`}>{n(r.loa_vigentes)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.iw_total ? 'text-rose-700' : 'text-gray-300'}`}>{n(r.iw_total)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.iw_reentry ? 'text-emerald-700' : 'text-gray-300'}`}>{n(r.iw_reentry)}</td>
                  <td className={`px-4 py-2.5 text-right ${r.iw_reincorporados ? 'text-amber-700' : 'text-gray-300'}`}>{n(r.iw_reincorporados)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${r.iw_vigentes ? 'text-rose-700' : 'text-gray-300'}`}>{n(r.iw_vigentes)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900">{n(r.retirados_netos)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-800">Total</td>
                <td className="px-4 py-3 text-right text-orange-700">{n(r3.loa_total)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{n(r3.loa_revertidos)}</td>
                <td className="px-4 py-3 text-right text-orange-700">{n(r3.loa_vigentes)}</td>
                <td className="px-4 py-3 text-right text-rose-700">{n(r3.iw_total)}</td>
                <td className="px-4 py-3 text-right text-emerald-700">{n(r3.iw_reentry)}</td>
                <td className="px-4 py-3 text-right text-amber-700">{n(r3.iw_reincorporados)}</td>
                <td className="px-4 py-3 text-right text-rose-700">{n(r3.iw_vigentes)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{n(r3.retirados_netos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'LOA', value: r3.loa_total, cls: 'text-orange-700' },
            { label: 'LOA revertidos', value: r3.loa_revertidos, cls: 'text-gray-600' },
            { label: 'LOA vigentes', value: r3.loa_vigentes, cls: 'text-orange-700 font-bold' },
            { label: 'IW', value: r3.iw_total, cls: 'text-rose-700' },
            { label: 'ReEntry (pagados)', value: r3.iw_reentry, cls: 'text-emerald-700' },
            { label: 'Reincorporados (sin pago)', value: r3.iw_reincorporados, cls: 'text-amber-700' },
            { label: 'IW vigentes', value: r3.iw_vigentes, cls: 'text-rose-700 font-bold' },
          ].map(c => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-[11px] text-gray-500">{c.label}</p>
              <p className={`text-xl tabular-nums ${c.cls}`}>{n(c.value)}</p>
            </div>
          ))}
        </div>
        <div className={`rounded-xl px-4 py-3 border ${r3Cierra ? 'bg-gray-50 border-gray-200' : 'bg-rose-50 border-rose-200'}`}>
          <p className="text-sm">
            <span className="text-gray-500">Retirados netos = </span>
            <span className="font-bold text-gray-900">{n(r3.retirados_netos)}</span>
            <span className="text-gray-400 text-xs"> · ({n(r3.loa_total)} LOA − {n(r3.loa_revertidos)} revertidos) + ({n(r3.iw_total)} IW − {n(r3.iw_reentry)} ReEntry − {n(r3.iw_reincorporados)} reincorporados)</span>
          </p>
          {!r3Cierra && (
            <p className="flex items-center gap-1.5 text-xs text-rose-700 mt-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              La identidad no cierra: hay retiros en estados imprevistos (LOA otros: {n(r3.loa_otros)} · IW otros: {n(r3.iw_otros)}). Revisar en Retiros.
            </p>
          )}
          {r3.loa_convertidos > 0 && (
            <p className="text-[11px] text-gray-400 mt-1">{n(r3.loa_convertidos)} LOA convertidos a IW se cuentan una sola vez, como IW.</p>
          )}
        </div>
      </section>

      <p className="text-[11px] text-gray-400">{d.r1.rows.map(r => `${r.sigla} = ${r.category}`).join(' · ')}</p>
    </div>
  )
}
