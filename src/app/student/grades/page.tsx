import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceRole } from '@supabase/supabase-js'
import { getEffectiveStudent } from '@/lib/student-identity'
import { GradesTable, type Grade } from '@/components/academic/grades-table'

export const revalidate = 0

export default async function StudentGradesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const student = await getEffectiveStudent(user ? { id: user.id, email: user.email } : null)

  let grades: Grade[] = []
  if (student?.document_number || student?.email) {
    const admin = createServiceRole(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Orden por asignatura: el estudiante lee su malla, no la cronología de
    // las cargas de SystemActiva.
    let q = (admin as any).from('academic_grades').select('*').order('course_code')
    q = student.document_number ? q.eq('document_number', student.document_number) : q.eq('email', student.email)
    const { data } = await q
    grades = (data ?? []) as Grade[]

    // El código que se muestra es el del plan de estudios, no el que trajo
    // SystemActiva: ese es un número de orden (207) y no el código de la
    // asignatura (STA 460). Las notas ya guardan su course_id.
    const ids = [...new Set(grades.map(g => (g as { course_id?: string | null }).course_id).filter(Boolean))] as string[]
    if (ids.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cursos } = await (admin as any).from('academic_courses').select('id, code').in('id', ids)
      const code = new Map<string, string | null>(((cursos ?? []) as { id: string; code: string | null }[]).map(c => [c.id, c.code]))
      grades = grades.map(g => {
        const cid = (g as { course_id?: string | null }).course_id
        return cid && code.get(cid) ? { ...g, course_code: code.get(cid) as string } : g
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Mis Notas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tus asignaturas y sus calificaciones</p>
      </div>
      {/* Sin cortes: los bloques y los años son herencia de SystemActiva y no
          corresponden a ningún período que el estudiante haya cursado. Ver el
          comentario en GradesTable. */}
      <GradesTable grades={grades} agrupacion="ninguno" />
    </div>
  )
}
