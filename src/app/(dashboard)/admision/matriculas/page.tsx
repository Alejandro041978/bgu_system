import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { GraduationCap, Users } from 'lucide-react'
import { MatriculasFilters } from '@/components/admision/matriculas-filters'

export const revalidate = 0

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function MatriculasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; block?: string }>
}) {
  const params = await searchParams
  const selectedYear = params.year ? parseInt(params.year) : null
  const selectedBlock = params.block ?? null

  const supabase = db()

  const { data: programs } = await supabase
    .from('academic_programs')
    .select('id, name, code')
    .order('name')

  // Trae TODAS las matrículas paginando: PostgREST corta en 1000 filas por request,
  // así que sin paginar los conteos salían truncados (mostraba 1000 en total).
  type Enr = { term_year: number | null; term_block: string | null; program_id: string | null }
  const allEnrollments: Enr[] = []
  {
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('academic_student_enrollments')
        .select('term_year, term_block, program_id')
        .range(from, from + pageSize - 1)
      if (error || !data || data.length === 0) break
      allEnrollments.push(...(data as Enr[]))
      if (data.length < pageSize) break
    }
  }

  const years = [...new Set(allEnrollments.map(e => e.term_year).filter((v): v is number => v != null))]
    .sort((a, b) => a - b)
  const blocks = [...new Set(allEnrollments.map(e => e.term_block).filter((v): v is string => v != null))]
    .sort()

  // Filter enrollments
  const filtered = allEnrollments.filter(e => {
    if (selectedYear && e.term_year !== selectedYear) return false
    if (selectedBlock && e.term_block !== selectedBlock) return false
    return true
  })

  const countMap: Record<string, number> = {}
  for (const e of filtered) {
    if (e.program_id) countMap[e.program_id] = (countMap[e.program_id] ?? 0) + 1
  }

  const rows = (programs ?? []).map(p => ({
    ...p,
    count: countMap[p.id] ?? 0,
  })).filter(r => r.count > 0).sort((a, b) => b.count - a.count)

  const total = rows.reduce((sum, r) => sum + r.count, 0)

  const filterLabel = selectedYear || selectedBlock
    ? [selectedYear ? `Año ${selectedYear}` : null, selectedBlock ? `Semestre ${selectedBlock}` : null]
        .filter(Boolean).join(' · ')
    : 'Todos los períodos'

  return (
    <>
      <Topbar title="Matrículas" subtitle="Estudiantes matriculados por programa" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Filtros */}
          <MatriculasFilters
            years={years}
            blocks={blocks}
            selectedYear={selectedYear}
            selectedBlock={selectedBlock}
          />

          {/* Resumen */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
                <p className="text-sm text-gray-500">Programas con matrículas</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{total.toLocaleString('es-PE')}</p>
                <p className="text-sm text-gray-500">{filterLabel}</p>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Programa</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Código</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">Matriculados</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">% del total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((program, i) => {
                  const pct = total > 0 ? ((program.count / total) * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={program.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-5 py-3 font-medium text-gray-800">{program.name}</td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">{program.code ?? '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs">
                          {program.count}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-500">{pct}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="text-center text-gray-400 py-10">Sin matrículas para el período seleccionado</p>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
