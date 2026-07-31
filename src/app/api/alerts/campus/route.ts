import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Avisos del campus para la cabecera del ERP.
//
// Un aula que deja de cumplir la auditoría deja de traer notas, y eso es
// silencioso: nadie se entera hasta que un estudiante reclama. Se ve en todas
// las pantallas a propósito — quien lo vea no suele ser quien lo arregla, pero
// sí puede avisarle a quien sí.
// ---------------------------------------------------------------------------
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ avisos: [] })
  if (await isStudentUser(user)) return NextResponse.json({ avisos: [] })

  const sb = db()
  const { data: aulas, error } = await sb.from('moodle_aula_audit')
    .select('aula_id, shortname, reject_since, reject_reason, matriculados')
    .not('reject_since', 'is', null)
    .order('reject_since')
  if (error) return NextResponse.json({ avisos: [], error: error.message })

  const ids = (aulas ?? []).map((a: { aula_id: number }) => String(a.aula_id))
  const notas = new Map<string, number>()
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await sb.from('academic_grades')
        .select('moodle_course_id').eq('source', 'moodle').in('moodle_course_id', ids.slice(i, i + 100))
      for (const g of (data ?? []) as { moodle_course_id: string }[]) {
        const k = String(g.moodle_course_id)
        notas.set(k, (notas.get(k) ?? 0) + 1)
      }
    }
  }

  const dias = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const avisos = (aulas ?? []).map((a: any) => ({
    aula_id: a.aula_id,
    aula: a.shortname,
    motivo: a.reject_reason,
    dias: dias(a.reject_since),
    matriculados: Number(a.matriculados ?? 0),
    notas_ya_importadas: notas.get(String(a.aula_id)) ?? 0,
  }))
  // Primero las que ya tenían notas: ésas se quedaron congeladas a mitad de
  // camino, que es peor que un aula que nunca importó.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  avisos.sort((x: any, y: any) => y.notas_ya_importadas - x.notas_ya_importadas || y.dias - x.dias)

  return NextResponse.json({
    total: avisos.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    congeladas: avisos.filter((a: any) => a.notas_ya_importadas > 0).length,
    avisos,
  })
}
