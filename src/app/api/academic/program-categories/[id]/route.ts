import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// PATCH → renombra la categoría y/o fija su nota de aprobación de destino
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const b = await req.json() as { passing_score?: number | null; name?: string; sigla?: string | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {}
  if ('passing_score' in b) patch.passing_score = b.passing_score ?? null
  if (typeof b.name === 'string') {
    const name = b.name.trim()
    if (!name) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
    patch.name = name
  }
  if ('sigla' in b) {
    const sigla = b.sigla?.trim().toUpperCase() || null
    if (sigla && sigla.length > 5) return NextResponse.json({ error: 'La sigla admite máximo 5 caracteres' }, { status: 400 })
    patch.sigla = sigla
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  const { error } = await db().from('academic_programs_category')
    .update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE → elimina la categoría solo si nada la referencia
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sb = db()
  const [{ count: progs }, { count: convs }] = await Promise.all([
    sb.from('academic_programs').select('id', { count: 'exact', head: true }).eq('category_id', id),
    sb.from('convocatorias').select('id', { count: 'exact', head: true }).eq('product_category_id', id),
  ])
  if ((progs ?? 0) > 0 || (convs ?? 0) > 0) {
    return NextResponse.json({
      error: `No se puede eliminar: la categoría tiene ${progs ?? 0} programa(s) y ${convs ?? 0} convocatoria(s) asociados`,
    }, { status: 409 })
  }
  const { error } = await sb.from('academic_programs_category').delete().eq('id', id)
  if (error) return NextResponse.json({ error: `No se pudo eliminar: ${error.message}` }, { status: 500 })
  return NextResponse.json({ ok: true })
}
