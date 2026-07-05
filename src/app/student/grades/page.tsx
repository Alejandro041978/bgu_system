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
    let q = (admin as any).from('academic_grades').select('*')
      .order('term_year', { ascending: false })
      .order('term_block', { ascending: false })
      .order('course_code')
    q = student.document_number ? q.eq('document_number', student.document_number) : q.eq('email', student.email)
    const { data } = await q
    grades = (data ?? []) as Grade[]
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Mis Notas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Consulta tus calificaciones por período académico</p>
      </div>
      <GradesTable grades={grades} />
    </div>
  )
}
