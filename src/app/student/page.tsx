import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getEffectiveStudent } from '@/lib/student-identity'
import { SchedulesView } from '@/components/academic/schedules-view'

export const revalidate = 0

export default async function StudentHomePage() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  const student = await getEffectiveStudent(user ? { id: user.id, email: user.email } : null)

  // Programas en los que el estudiante está matriculado
  let programIds: string[] = []
  if (student?.document_number || student?.email) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sq = (supabase as any).from('academic_students').select('id')
    const { data: stu } = await (student.document_number
      ? sq.eq('document_number', student.document_number).maybeSingle()
      : sq.eq('email', student.email).maybeSingle())
    if (stu) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: enr } = await (supabase as any).from('academic_student_enrollments')
        .select('program_id').eq('student_id', stu.id)
      programIds = [...new Set(((enr ?? []) as { program_id: string }[]).map(e => e.program_id).filter(Boolean))] as string[]
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [programsRes, yearsRes, categoriesRes] = await Promise.all([
    (supabase as any).from('academic_programs').select('id, name, code, category_id').order('name'),
    (supabase as any).from('academic_years').select('id, name, semesters:academic_semesters(id, name)').order('name', { ascending: false }),
    (supabase as any).from('academic_programs_category').select('id, name').order('name'),
  ])

  // Solo los programas matriculados del estudiante (y sus categorías)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programs = (programsRes.data ?? []).filter((p: { id: string }) => programIds.includes(p.id))
  const catIds = new Set(programs.map((p: { category_id: string | null }) => p.category_id).filter(Boolean))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categories = (categoriesRes.data ?? []).filter((c: { id: string }) => catIds.has(c.id))

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Cronogramas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Consulta los cronogramas académicos</p>
      </div>
      <SchedulesView programs={programs} years={yearsRes.data ?? []} categories={categories} />
    </div>
  )
}
