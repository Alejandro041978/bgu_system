'use client'

import { useEffect, useState } from 'react'
import { Loader2, GraduationCap, FileSignature } from 'lucide-react'

interface YearRow { year: string; start_date: string | null; end_date: string | null; con_contrato: number; en_firma: number; sin_contrato: number }
interface Data {
  total_docentes: number
  credenciales: { aprobados: number; en_revision: number; sin_expediente: number; por_nivel: Record<string, number> }
  contratos_por_ano: YearRow[]
  firmados_sin_fechas: string[]
}

const NIVEL: Record<string, string> = { master: 'Máster', doctor: 'Doctor', bachelor: 'Bachelor' }

export function FacultyStatusReport() {
  const [d, setD] = useState<Data | null>(null)
  useEffect(() => { fetch('/api/reports/faculty-status').then(r => r.json()).then(setD) }, [])

  if (!d) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
  if ('error' in d) return <p className="text-sm text-red-500">{String((d as { error: string }).error)}</p>

  const c = d.credenciales
  const noAprobados = c.en_revision + c.sin_expediente

  return (
    <div className="space-y-5">
      {/* Credenciales */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <GraduationCap className="w-4 h-4 text-gray-400" />Credenciales
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-2xl font-bold text-gray-900">{d.total_docentes}</p>
            <p className="text-xs text-gray-500">Docentes</p>
          </div>
          <div className="rounded-lg bg-green-50 p-3">
            <p className="text-2xl font-bold text-green-700">{c.aprobados}</p>
            <p className="text-xs text-green-700">Revisión aprobada</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3">
            <p className="text-2xl font-bold text-amber-700">{noAprobados}</p>
            <p className="text-xs text-amber-700">Sin aprobar</p>
            {noAprobados > 0 && (
              <p className="text-[10px] text-amber-600 mt-0.5">
                {c.en_revision > 0 && `${c.en_revision} en revisión`}
                {c.en_revision > 0 && c.sin_expediente > 0 && ' · '}
                {c.sin_expediente > 0 && `${c.sin_expediente} sin expediente`}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-sm font-semibold text-blue-800 space-x-2">
              {Object.entries(c.por_nivel).map(([k, v]) => (
                <span key={k}>{v} {NIVEL[k] ?? k}</span>
              ))}
            </p>
            <p className="text-xs text-blue-700 mt-1">Nivel aprobado</p>
          </div>
        </div>
      </div>

      {/* Contratados por año académico */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-1.5">
          <FileSignature className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Contratados</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Año académico</th>
                <th className="text-right px-4 py-3">Docentes</th>
                <th className="text-right px-4 py-3">Con contrato</th>
                <th className="text-right px-4 py-3">En firma</th>
                <th className="text-right px-4 py-3">Sin contrato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.contratos_por_ano.map(y => (
                <tr key={y.year} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-700">
                    {y.year}
                    <span className="text-xs text-gray-400 ml-2">{y.start_date} → {y.end_date}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-900 font-semibold">{d.total_docentes}</td>
                  <td className={`px-4 py-2.5 text-right ${y.con_contrato ? 'text-green-700 font-semibold' : 'text-gray-300'}`}>{y.con_contrato}</td>
                  <td className={`px-4 py-2.5 text-right ${y.en_firma ? 'text-amber-700' : 'text-gray-300'}`}>{y.en_firma}</td>
                  <td className={`px-4 py-2.5 text-right ${y.sin_contrato ? 'text-rose-700' : 'text-gray-300'}`}>{y.sin_contrato}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {d.firmados_sin_fechas.length > 0 && (
        <div className="text-xs bg-amber-50 text-amber-800 rounded-lg px-4 py-3">
          ⚠ {d.firmados_sin_fechas.length} contrato(s) firmado(s) sin fechas de vigencia — no se pueden atribuir a ningún año académico:
          {' '}{d.firmados_sin_fechas.join(', ')}. Corrígelos en Contratos para que cuenten.
        </div>
      )}

      <div className="text-[11px] text-gray-400 space-y-1">
        <p><b>Con contrato</b> = docentes con un contrato <b>firmado</b> cuya vigencia se cruza con el año académico. <b>En firma</b> = contrato enviado y aún sin firmar.</p>
        <p>Solo se cuentan contratos de docentes (personal con perfil académico); los del resto del personal no figuran aquí.</p>
      </div>
    </div>
  )
}
