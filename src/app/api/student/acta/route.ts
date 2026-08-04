import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getEffectiveStudent } from '@/lib/student-identity'
import { computeActa } from '@/lib/acta'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// El acta del estudiante que está en sesión.
//
// No recibe student_id: lo resuelve del propio usuario. Esa es la diferencia
// con /api/academic/acta, que sirve a Registros y por eso sí acepta un id —
// un portal que aceptara ids ajenos sería un lector del expediente de
// cualquiera con solo cambiar un número en la URL.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'No es un estudiante' }, { status: 403 })

  const sb = db()
  let stu = null
  if (ident.email) {
    const { data } = await sb.from('academic_students').select('id').eq('email', ident.email).eq('disabled', false).maybeSingle()
    stu = data
  }
  if (!stu && ident.document_number) {
    const { data } = await sb.from('academic_students').select('id').eq('document_number', ident.document_number).maybeSingle()
    stu = data
  }
  if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  const { data: enrolls } = await sb.from('academic_student_enrollments')
    .select('program_id, program:academic_programs(id, name)').eq('student_id', stu.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programas = [...new Map(((enrolls ?? []) as any[])
    .filter(e => e.program).map(e => [e.program.id, { id: e.program.id, name: e.program.name }])).values()]
  if (!programas.length) return NextResponse.json({ programas: [], acta: null })

  // El programa pedido solo vale si es SUYO: aceptar cualquiera convertiría
  // esta ruta en el mismo agujero que la de Registros.
  const pedido = req.nextUrl.searchParams.get('program_id')
  const elegido = programas.find(p => p.id === pedido) ?? programas[0]

  const acta = await computeActa(sb, stu.id, elegido.id)
  return NextResponse.json({ programas, programa_id: elegido.id, acta })
}
