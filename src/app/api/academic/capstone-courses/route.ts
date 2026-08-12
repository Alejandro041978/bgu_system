import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardSuperadmin } from '@/lib/api-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Qué asignaturas son capstone. Buscar y marcar, no adivinar por el nombre.
//
// Es potestad del superadministrador aunque la página de notas sea delegable:
// marcar una asignatura aquí decide sobre qué puede editar el colaborador, así
// que quien define el alcance no puede ser quien trabaja dentro de él.
// ---------------------------------------------------------------------------

// GET ?q= → asignaturas que coinciden con la búsqueda, y todas las marcadas.
export async function GET(req: NextRequest) {
  const noAutorizado = await guardSuperadmin()
  if (noAutorizado) return noAutorizado

  const sb = db()
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()

  const { data: progs } = await sb.from('academic_programs').select('id, name')
  const nom = new Map((progs ?? []).map((p: { id: string; name: string }) => [String(p.id), p.name]))

  const { data: marcadas } = await sb.from('academic_courses')
    .select('id, name, code, program_id').eq('is_capstone', true)

  let encontradas: unknown[] = []
  if (q.length >= 2) {
    const { data } = await sb.from('academic_courses')
      .select('id, name, code, program_id, is_capstone').ilike('name', `%${q}%`).limit(60)
    encontradas = data ?? []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pinta = (c: any) => ({
    id: c.id, name: c.name, code: c.code,
    programa: nom.get(String(c.program_id)) ?? '—',
    is_capstone: c.is_capstone ?? true,
  })

  return NextResponse.json({
    marcadas: (marcadas ?? []).map(pinta)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => String(a.programa).localeCompare(String(b.programa))),
    encontradas: encontradas.map(pinta),
  })
}

// PATCH { course_id, is_capstone } → marca o desmarca, y arrastra la
// consecuencia: un aula de asignatura capstone no sincroniza notas.
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardSuperadmin()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null) as { course_id?: string; is_capstone?: boolean } | null
  if (!b?.course_id || typeof b.is_capstone !== 'boolean') {
    return NextResponse.json({ error: 'Falta course_id o is_capstone' }, { status: 400 })
  }

  const sb = db()
  const { error } = await sb.from('academic_courses')
    .update({ is_capstone: b.is_capstone }).eq('id', b.course_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marcarla apaga la sincronización de sus aulas en el acto. Desmarcarla NO la
  // vuelve a encender: reanudar la importación sobre un acta que ya se llevó a
  // mano es una decisión con consecuencias, y se toma en Vinculación de Aulas
  // mirando el aula concreta, no de rebote desde aquí.
  let aulas = 0
  if (b.is_capstone) {
    const { data } = await sb.from('moodle_course_links')
      .update({ sync_enabled: false, sync_enabled_by: user.id, sync_enabled_at: new Date().toISOString() })
      .eq('course_id', b.course_id).eq('sync_enabled', true).select('aula_id')
    aulas = (data ?? []).length
  }

  return NextResponse.json({ ok: true, aulas_desconectadas: aulas })
}
