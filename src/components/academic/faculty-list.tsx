import { GraduationCap, Mail, BookOpen } from 'lucide-react'
import Link from 'next/link'

type Assignment = {
  semester: { name: string; academic_year: { name: string } }
  course: { name: string }
  hours_per_week: number | null
}

type FacultyMember = {
  id: string
  full_name: string
  email: string
  position: string | null
  assignments: Assignment[]
}

export function FacultyList({ faculty }: { faculty: FacultyMember[] }) {
  if (faculty.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
        <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No hay colaboradores marcados como Faculty.</p>
        <p className="text-xs text-gray-400 mt-1">Ve al perfil de un colaborador y activa la opción "Es docente".</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Docentes (Faculty)</h1>
        <p className="text-sm text-gray-500 mt-0.5">{faculty.length} docentes activos con sus asignaciones académicas</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-50">
          {faculty.map(f => {
            // Group assignments by semester
            const bySemester = f.assignments.reduce((acc, a) => {
              const key = `${a.semester.academic_year.name} · ${a.semester.name}`
              if (!acc[key]) acc[key] = []
              acc[key].push(a)
              return acc
            }, {} as Record<string, Assignment[]>)

            return (
              <div key={f.id} className="px-6 py-4 flex gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {f.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/hr/${f.id}`} className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                      {f.full_name}
                    </Link>
                    <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <GraduationCap className="w-3 h-3" /> Faculty
                    </span>
                  </div>
                  {f.position && <p className="text-xs text-gray-500">{f.position}</p>}
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400">
                    <Mail className="w-3 h-3" /> {f.email}
                  </div>

                  {/* Asignaciones por semestre */}
                  {Object.keys(bySemester).length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {Object.entries(bySemester).map(([semester, assignments]) => (
                        <div key={semester}>
                          <p className="text-xs font-medium text-gray-500 mb-1">{semester}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {assignments.map((a, i) => (
                              <span key={i} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                                <BookOpen className="w-3 h-3 text-gray-400" />
                                {a.course.name}
                                {a.hours_per_week ? <span className="text-gray-400">· {a.hours_per_week}h</span> : null}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-400 italic">Sin asignaciones en semestres activos</p>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-gray-800">{f.assignments.length}</p>
                  <p className="text-xs text-gray-400">asignaciones</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
