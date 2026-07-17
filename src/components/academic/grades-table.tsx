'use client'

import { GraduationCap, Award } from 'lucide-react'

export interface Grade {
  external_id: string
  course_code: string | null
  course_name: string | null
  credits: number | null
  term_year: number | null
  term_block: string | null
  final_grade: number | null
  retake_grade: number | null
  passing_score: number | null
  group_number: number | null
  source?: string | null
  program_ids?: string[]
}

function gradeInfo(g: Grade): { value: number | null; passed: boolean | null; label: string } {
  const value = g.retake_grade ?? g.final_grade
  if (value === null || value === undefined) return { value: null, passed: null, label: 'En curso' }
  const threshold = g.passing_score
  const passed = threshold != null ? value >= threshold : null
  return { value, passed, label: passed === null ? '' : passed ? 'Aprobado' : 'Desaprobado' }
}

export function GradesTable({ grades }: { grades: Grade[] }) {
  if (grades.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
        <GraduationCap className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No hay notas registradas.</p>
      </div>
    )
  }

  // Agrupar por período (año + bloque), más reciente primero
  const groups = new Map<string, Grade[]>()
  for (const g of grades) {
    const key = `${g.term_year ?? '—'}·${g.term_block ?? '—'}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(g)
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([key, rows]) => {
        const [year, block] = key.split('·')
        const withGrade = rows.filter(r => gradeInfo(r).value !== null)
        const avg = withGrade.length
          ? (withGrade.reduce((s, r) => s + (gradeInfo(r).value ?? 0), 0) / withGrade.length).toFixed(1)
          : null
        return (
          <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
              <Award className="w-4 h-4 text-blue-500" />
              <p className="text-sm font-semibold text-gray-900">Año {year} · Bloque {block}</p>
              {avg && <span className="ml-auto text-xs text-gray-500">Promedio: <span className="font-semibold text-gray-700">{avg}</span></span>}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Asignatura</th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Cr.</th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Nota</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(g => {
                  const info = gradeInfo(g)
                  return (
                    <tr key={g.external_id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-800 flex items-center gap-2">
                          {g.course_name ?? '—'}
                          {g.source === 'convalidacion' && <span className="text-[10px] font-medium bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full">Convalidado</span>}
                          {g.source === 'validacion' && <span className="text-[10px] font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full">Validado</span>}
                        </p>
                        {g.course_code && <p className="text-xs text-gray-400">{g.course_code}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{g.credits ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        {info.value === null ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className={`font-semibold ${info.passed === false ? 'text-red-600' : info.passed ? 'text-green-600' : 'text-gray-800'}`}>
                            {info.value}
                            {g.retake_grade != null && <span className="text-xs text-gray-400 ml-1">(rec.)</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {info.label && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            info.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                          }`}>{info.label}</span>
                        )}
                        {info.value === null && <span className="text-xs text-gray-400">En curso</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
