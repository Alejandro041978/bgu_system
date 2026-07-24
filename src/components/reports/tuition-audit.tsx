'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, ExternalLink, ShieldCheck, ShieldAlert } from 'lucide-react'

interface Row {
  student_id: string; student_name: string; document_number: string | null
  program_name: string | null; sigla: string | null
  list_price: number; transfer_savings: number; scholarship_pct: number | null; beca: number
  expected_tuition: number; billed_tuition: number; diff: number
}

const money = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function TuitionAudit() {
  const [categories, setCategories] = useState<{ id: string; name: string; sigla: string | null }[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [auditadas, setAuditadas] = useState(0)
  const [coinciden, setCoinciden] = useState(0)
  const [cat, setCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (c: string) => {
    setLoading(true)
    const d = await fetch(`/api/reports/tuition-audit${c ? `?category=${c}` : ''}`).then(r => r.json())
    if (d.error) { setError(d.error); setLoading(false); return }
    setCategories(d.categories ?? []); setRows(d.mismatches ?? [])
    setAuditadas(d.auditadas ?? 0); setCoinciden(d.coinciden ?? 0)
    setLoading(false)
  }, [])
  useEffect(() => { load(cat) }, [cat, load])

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-600">Categoría</label>
        <select value={cat} onChange={e => setCat(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas las categorías</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        {!loading && (
          <div className="ml-auto flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-green-600"><ShieldCheck className="w-4 h-4" />{coinciden} coinciden</span>
            <span className={`flex items-center gap-1.5 ${rows.length ? 'text-red-600' : 'text-gray-400'}`}><ShieldAlert className="w-4 h-4" />{rows.length} con desviación</span>
            <span className="text-gray-400">{auditadas} matrículas auditadas</span>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-4 py-2 text-left">Estudiante</th>
                <th className="px-4 py-2 text-left">Programa</th>
                <th className="px-4 py-2 text-right">Lista</th>
                <th className="px-4 py-2 text-right">Ahorro TC</th>
                <th className="px-4 py-2 text-right">Beca</th>
                <th className="px-4 py-2 text-right">Tuition esperado</th>
                <th className="px-4 py-2 text-right">Tuition facturado</th>
                <th className="px-4 py-2 text-right">Desviación</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.student_id + (r.program_name ?? '')} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2">
                    <span className="text-gray-800">{r.student_name}</span>
                    <span className="block text-[11px] text-gray-400">{r.document_number} · {r.sigla}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 max-w-52 truncate" title={r.program_name ?? ''}>{r.program_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500">{money(r.list_price)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-teal-700">{r.transfer_savings > 0 ? money(r.transfer_savings) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-violet-700">{r.beca > 0 ? `${money(r.beca)} (${r.scholarship_pct}%)` : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{money(r.expected_tuition)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.billed_tuition)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${r.diff > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                    {r.diff > 0 ? '+' : ''}{money(r.diff)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/academic/account?student=${r.student_id}`} target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                      <ExternalLink className="w-3.5 h-3.5" />Estado de cuenta
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-gray-400">
                  🎉 Sin desviaciones: el Tuition facturado de todas las matrículas auditadas coincide con lista − ahorro − beca.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
          Tuition esperado = precio oficial − Transfer Credit Savings − beca. Se compara contra la suma de cuotas
          de concepto Tuition. Tolerancia ±$0.50. Solo se auditan matrículas con precio de lista congelado.
          Desviación positiva = se facturó de más; negativa = de menos.
        </p>
      </div>
    </div>
  )
}
