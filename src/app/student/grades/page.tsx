import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { GradesTable, type Grade } from '@/components/academic/grades-table'

export const revalidate = 0

export default async function StudentGradesPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()

  let grades: Grade[] = []
  if (user?.email) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any

    // Buscar el documento del estudiante por su correo (en academic_students)
    const { data: student } = await sb
      .from('academic_students')
      .select('document_number')
      .eq('email', user.email)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = sb.from('academic_grades').select('*')
      .order('term_year', { ascending: false })
      .order('term_block', { ascending: false })
      .order('course_code')
    q = student?.document_number
      ? q.eq('document_number', student.document_number)
      : q.eq('email', user.email)

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
