import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { GraduationCap, Users } from 'lucide-react'

export const revalidate = 0

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function MatriculasPage() {
  const supabase = db()

  const { data: programs } = await supabase
    .from('academic_programs')
    .select('id, name, code')
    .order('name')

  const { data: enrollments } = await supabase
    .from('academic_student_enrollments')
    .select('program_id')

  const countMap: Record<string, number> = {}
  for (const e of enrollments ?? []) {
    if (e.program_id) countMap[e.program_id] = (countMap[e.program_id] ?? 0) + 1
  }

  const rows = (programs ?? []).map(p => ({
    ...p,
    count: countMap[p.id] ?? 0,
  })).sort((a, b) => b.count - a.count)

  const total = rows.reduce((sum, r) => sum + r.count, 0)

  return (
    <>
      <Topbar title="Matrículas" subtitle="Estudiantes matriculados por programa" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Resumen */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
                <p className="text-sm text-gray-500">Programas activos</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{total.toLocaleString('es-PE')}</p>
                <p className="text-sm text-gray-500">Total matriculados</p>
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
              <p className="text-center text-gray-400 py-10">Sin datos de matrículas</p>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
