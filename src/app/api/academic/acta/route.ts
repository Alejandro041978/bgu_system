import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { computeActa } from '@/lib/acta'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET ?student_id=&program_id= → acta: malla del programa con estado por asignatura
//
// Esta ruta acepta un student_id ajeno, así que es de Registros y no del
// portal: los estudiantes tienen sesión de Supabase, y sin este rechazo
// bastaba cambiar un número en la URL para leer el expediente de cualquiera.
// El portal usa /api/student/acta, que resuelve al estudiante de su sesión.
export async function GET(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const studentId = req.nextUrl.searchParams.get('student_id')
  const programId = req.nextUrl.searchParams.get('program_id')
  if (!studentId || !programId) return NextResponse.json({ error: 'Falta student_id o program_id' }, { status: 400 })

  const acta = await computeActa(db(), studentId, programId)
  if (!acta) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })
  return NextResponse.json(acta)
}
