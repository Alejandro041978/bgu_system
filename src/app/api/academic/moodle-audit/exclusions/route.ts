import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff, guardSuperadmin } from '@/lib/api-guard'
import { cargarExclusiones, estaExcluida } from '@/lib/moodle-audit-exclusions'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Las categorías que el Auditor del Campus no mide.
//
// Leerlas es para todo el personal: quien mira el auditor tiene derecho a saber
// qué no está mirando. Cambiarlas es del superadministrador — excluir algo de
// una auditoría es decidir sobre qué no se responde, y esa no es una decisión
// de quien trabaja dentro de ella.
// ---------------------------------------------------------------------------

// GET → exclusiones declaradas + las categorías que hoy existen en la foto del
// auditor, con cuántas aulas tiene cada una. Se ofrecen para elegir en vez de
// escribir: una ruta mal tecleada no excluye nada y no avisa.
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const sb = db()
  const exclusiones = await cargarExclusiones(sb)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('moodle_aula_audit').select('categoria').range(from, from + 999)
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < 1000) break
  }

  const cuenta = new Map<string, number>()
  for (const r of rows) {
    const c = r.categoria ? String(r.categoria) : '(sin categoría)'
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1)
  }
  const categorias = [...cuenta].map(([ruta, aulas]) => ({
    ruta, aulas, excluida: estaExcluida(ruta, exclusiones),
  })).sort((a, b) => a.ruta.localeCompare(b.ruta))

  return NextResponse.json({
    exclusiones,
    categorias,
    aulas_excluidas: categorias.filter(c => c.excluida).reduce((s, c) => s + c.aulas, 0),
  })
}

// POST { ruta, nota } → declara una exclusión.  DELETE ?ruta= → la retira.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardSuperadmin()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  const b = await req.json().catch(() => null) as { ruta?: string; nota?: string } | null
  const ruta = (b?.ruta ?? '').trim()
  if (!ruta) return NextResponse.json({ error: 'Falta la categoría' }, { status: 400 })

  const nota = (b?.nota ?? '').trim()
  if (!nota) return NextResponse.json({ error: 'Escribe por qué se excluye: dentro de un año será lo único que lo explique.' }, { status: 400 })

  const sb = db()
  const { error } = await sb.from('moodle_audit_exclusions')
    .upsert({ ruta, nota, created_by: user?.id ?? null }, { onConflict: 'ruta' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cuántas aulas deja de mirar el auditor, para que la consecuencia se vea en
  // el momento de decidirla y no dentro de tres meses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('moodle_aula_audit').select('categoria').range(from, from + 999)
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < 1000) break
  }
  const afectadas = rows.filter(r => estaExcluida(r.categoria, [{ ruta, nota }])).length

  return NextResponse.json({ ok: true, ruta, aulas_excluidas: afectadas })
}

export async function DELETE(req: NextRequest) {
  const noAutorizado = await guardSuperadmin()
  if (noAutorizado) return noAutorizado

  const ruta = (req.nextUrl.searchParams.get('ruta') ?? '').trim()
  if (!ruta) return NextResponse.json({ error: 'Falta la categoría' }, { status: 400 })

  const { error } = await db().from('moodle_audit_exclusions').delete().eq('ruta', ruta)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ruta })
}
