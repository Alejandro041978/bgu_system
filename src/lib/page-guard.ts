import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { esSuperadmin } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ---------------------------------------------------------------------------
// Exige el permiso de una página concreta, de verdad y ahora.
//
// El permisionador ya sabe quién puede editar qué, pero se evalúa en el
// middleware en modo auditoría: registra y deja pasar. Mientras siga así, un
// endpoint que solo llama a guardStaff está abierto a cualquier colaborador,
// diga lo que diga su rol. Eso fue lo que permitió 53 ediciones de notas por
// gente cuyo rol decía editar=false.
//
// Este guard lo cierra para un endpoint concreto sin esperar a que todo el ERP
// pase a modo estricto. Se usa donde la consecuencia de equivocarse es cara:
// declarar que una asignatura es capstone o de campus socio decide sobre qué
// puede calificar otra persona.
//
// La diferencia con guardSuperadmin es deliberada: aquí NO se centraliza. La
// regulación de la malla es de la Dirección Académica, y su rol ya lo dice
// —academic_director tiene academic_programs · editar—. El código pregunta por
// el permiso; quién lo tiene se decide en el configurador, no aquí.
// ---------------------------------------------------------------------------
export async function guardPagina(pageKey: string, accion: 'edit' | 'delete' = 'edit'): Promise<NextResponse | null> {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (await esSuperadmin(user)) return null

  const negar = NextResponse.json({
    error: 'Tu rol no tiene permiso para esta acción.',
  }, { status: 403 })

  // Un estudiante no tiene ficha de colaborador y llegaría a la consulta de rol
  // con las manos vacías: se corta antes y explícito.
  if (await isStudentUser(user)) return negar

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin() as any
  const { data: emp } = await sb.from('hr_employees')
    .select('role_id').eq('user_id', user.id).maybeSingle()
  if (!emp?.role_id) return negar

  const { data: perm } = await sb.from('role_permissions')
    .select('can_edit, can_delete').eq('role_id', emp.role_id).eq('page_key', pageKey).maybeSingle()
  const ok = accion === 'delete' ? perm?.can_delete : perm?.can_edit
  return ok ? null : negar
}
