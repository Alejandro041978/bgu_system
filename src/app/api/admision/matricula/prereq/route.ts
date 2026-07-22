import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { checkEnrollmentPrereq } from '@/lib/enrollment-prereq'

export const revalidate = 0

// GET ?student_id=&program_id= → ¿cumple el prerrequisito académico?
// (Master exige Bachelor nuestro terminado o con ≤2 asignaturas; Doctorado
// exige lo mismo del Master.) Alimenta el aviso de Nueva Matrícula.
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const studentId = req.nextUrl.searchParams.get('student_id')
  const programId = req.nextUrl.searchParams.get('program_id')
  if (!studentId || !programId) return NextResponse.json({ error: 'Faltan student_id y program_id' }, { status: 400 })

  return NextResponse.json(await checkEnrollmentPrereq(studentId, programId))
}
