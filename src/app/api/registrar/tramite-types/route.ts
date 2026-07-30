import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isStudentUser } from '@/lib/student-identity'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function limpiar(b: any) {
  const num = (v: unknown) => (v === '' || v == null ? null : Number(v))
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    name: txt(b.name),
    description: txt(b.description),
    price: Number(b.price) || 0,
    currency: txt(b.currency) ?? 'USD',
    charge_concept: num(b.charge_concept),
    request_note_label: txt(b.request_note_label),
    instructions: txt(b.instructions),
    requires_situation: txt(b.requires_situation),
    requires_situation_note: txt(b.requires_situation_note),
    active: b.active !== false,
  }
}

// GET → catálogo + los catálogos que necesita el formulario
export async function GET() {
  const g = await requireStaff()
  if (g.error) return g.error
  const sb = db()
  const [{ data: types, error }, { data: concepts }] = await Promise.all([
    sb.from('tramite_types').select('*').order('name'),
    sb.from('account_concepts').select('type_code, abbr, name').eq('kind', 'charge').order('type_code'),
  ])
  if (error) return NextResponse.json({ error: 'Falta correr supabase/tramites.sql: ' + error.message }, { status: 400 })

  // Cuántas solicitudes tiene cada tipo: es lo que decide si se puede borrar o
  // solo desactivar.
  const { data: reqs } = await sb.from('tramite_requests').select('tramite_type_id')
  const usos: Record<string, number> = {}
  for (const r of (reqs ?? []) as { tramite_type_id: string }[]) usos[r.tramite_type_id] = (usos[r.tramite_type_id] ?? 0) + 1

  return NextResponse.json({ types: types ?? [], concepts: concepts ?? [], usos })
}

export async function POST(req: NextRequest) {
  const g = await requireStaff()
  if (g.error) return g.error
  const b = await req.json().catch(() => null)
  const row = limpiar(b ?? {})
  if (!row.name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  const { data, error } = await db().from('tramite_types').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(req: NextRequest) {
  const g = await requireStaff()
  if (g.error) return g.error
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const row = limpiar(b)
  if (!row.name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  const { error } = await db().from('tramite_types')
    .update({ ...row, updated_at: new Date().toISOString() }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= → solo si NUNCA se usó. Un tipo con solicitudes se DESACTIVA:
// borrarlo dejaría trámites históricos apuntando a un tipo inexistente y las
// pantallas mostrarían "—" donde debería decir qué pidió el estudiante.
export async function DELETE(req: NextRequest) {
  const g = await requireStaff()
  if (g.error) return g.error
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { count } = await sb.from('tramite_requests')
    .select('id', { count: 'exact', head: true }).eq('tramite_type_id', id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: `Este trámite tiene ${count} solicitud(es) y no se puede borrar sin romper su historial. Desactívalo: deja de ofrecerse y lo ya pedido se conserva.`,
    }, { status: 409 })
  }
  const { error } = await sb.from('tramite_types').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
