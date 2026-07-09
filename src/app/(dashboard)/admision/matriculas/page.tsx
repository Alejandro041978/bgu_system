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
  searchParams: Promise<{ year?: string; semester?: string; category?: string }>
}) {
  const params = await searchParams
  const selectedYear = params.year ?? null          // academic_year_id
  const selectedSemester = params.semester ?? null  // academic_semester_id
  const selectedCategory = params.category ?? null

  const supabase = db()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: programs }, { data: categories }, { data: convs }, { data: sems }, { data: acadYears }] = await Promise.all([
    supabase.from('academic_programs').select('id, name, code, category_id').order('name'),
    supabase.from('academic_programs_category').select('id, name').order('name'),
    supabase.from('convocatorias').select('id, academic_semester_id'),
    supabase.from('academic_semesters').select('id, name, academic_year_id, start_date').order('start_date'),
    supabase.from('academic_years').select('id, name').order('name'),
  ])

  // Mapas: convocatoria → semestre → año académico (calendario LIMPIO)
  const convToSem = new Map<string, string | null>()
  for (const c of convs ?? []) convToSem.set(c.id, c.academic_semester_id ?? null)
  const semInfo = new Map<string, { name: string; year_id: string | null }>()
  for (const s of sems ?? []) semInfo.set(s.id, { name: s.name, year_id: s.academic_year_id ?? null })
  const yearName = new Map<string, string>()
  for (const y of acadYears ?? []) yearName.set(y.id, y.name)

  // Trae TODAS las matrículas paginando (PostgREST corta en 1000 por request)
  type RawEnr = { convocatoria_id: string | null; program_id: string | null }
  const rawEnrollments: RawEnr[] = []
  {
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('academic_student_enrollments')
        .select('convocatoria_id, program_id')
        .range(from, from + pageSize - 1)
      if (error || !data || data.length === 0) break
      rawEnrollments.push(...(data as RawEnr[]))
      if (data.length < pageSize) break
    }
  }

  // Derivar semestre + año académico de cada matrícula vía la convocatoria
  const allEnrollments = rawEnrollments.map(e => {
    const sem_id = e.convocatoria_id ? convToSem.get(e.convocatoria_id) ?? null : null
    const year_id = sem_id ? semInfo.get(sem_id)?.year_id ?? null : null
    return { program_id: e.program_id, sem_id, year_id }
  })

  // Opciones de filtro: solo años/semestres presentes en las matrículas
  const yearsPresent = new Set(allEnrollments.map(e => e.year_id).filter(Boolean))
  const semsPresent = new Set(allEnrollments.map(e => e.sem_id).filter(Boolean))
  const years = (acadYears ?? []).filter(y => yearsPresent.has(y.id)).map(y => ({ id: y.id, name: y.name }))
  const semesters = (sems ?? []).filter(s => semsPresent.has(s.id))
    .map(s => ({ id: s.id, name: s.name, year_id: s.academic_year_id ?? '' }))

  // Filtrar
  const filtered = allEnrollments.filter(e => {
    if (selectedYear && e.year_id !== selectedYear) return false
    if (selectedSemester && e.sem_id !== selectedSemester) return false
    return true
  })

  const countMap: Record<string, number> = {}
  for (const e of filtered) {
    if (e.program_id) countMap[e.program_id] = (countMap[e.program_id] ?? 0) + 1
  }

  const rows = (programs ?? []).map(p => ({
    ...p,
    count: countMap[p.id] ?? 0,
  }))
    .filter(r => r.count > 0)
    .filter(r => !selectedCategory || r.category_id === selectedCategory)
    .sort((a, b) => b.count - a.count)

  const total = rows.reduce((sum, r) => sum + r.count, 0)

  const categoryLabel = selectedCategory
    ? (categories ?? []).find(c => c.id === selectedCategory)?.name ?? ''
    : null
  const filterLabel = [
    categoryLabel,
    selectedYear ? (yearName.get(selectedYear) ?? null) : null,
    selectedSemester ? (semInfo.get(selectedSemester)?.name ?? null) : null,
  ].filter(Boolean).join(' · ') || 'Todos los períodos'

  return (
    <>
      <Topbar title="Matrículas" subtitle="Estudiantes matriculados por programa" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Filtros */}
          <MatriculasFilters
            years={years}
            semesters={semesters}
            categories={categories ?? []}
            selectedYear={selectedYear}
            selectedSemester={selectedSemester}
            selectedCategory={selectedCategory}
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
