import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'
import { isStudentUser } from '@/lib/student-identity'
import { auditarVinculos } from '@/lib/link-audit'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → contradicciones entre lo que el ERP cree que enseña un aula y lo que
// dicen las otras evidencias que ya tenemos. Solo lee.
export async function GET() {
  const noAutorizado = await guardStaff(); if (noAutorizado) return noAutorizado
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const r = await auditarVinculos(db())
    return NextResponse.json({
      revisadas: r.revisadas,
      total: r.hallazgos.length,
      por_tipo: {
        titulo: r.hallazgos.filter(h => h.tipo === 'titulo').length,
        fuentes: r.hallazgos.filter(h => h.tipo === 'fuentes').length,
        convalidada: r.hallazgos.filter(h => h.tipo === 'convalidada').length,
      },
      hallazgos: r.hallazgos,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
