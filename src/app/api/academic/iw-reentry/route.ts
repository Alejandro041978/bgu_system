import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'
import { casosPendientes, previewCaso, aplicarCaso, descartarCaso } from '@/lib/iw-reentry'
import { recomputeSituations } from '@/lib/withdrawals'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET                     → cola de casos pendientes
// GET ?kind=&trigger_id=  → vista previa completa de un caso
// POST { kind, trigger_id, action: 'aplicar'|'descartar', nota? }
//   Aplicar ejecuta EXACTAMENTE lo que la vista previa mostró: el servidor la
//   recalcula en el momento y esa es la que se escribe y se sella. Nada se
//   aplica sin este paso — la autorización es el clic de quien revisó.
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()
  try {
    const kind = req.nextUrl.searchParams.get('kind')
    const triggerId = req.nextUrl.searchParams.get('trigger_id')
    const casos = await casosPendientes(sb)
    if (!kind || !triggerId) return NextResponse.json({ casos })
    const caso = casos.find(c => c.kind === kind && c.trigger_id === triggerId)
    if (!caso) return NextResponse.json({ error: 'Ese caso ya no está pendiente' }, { status: 404 })
    if (caso.bloqueado_por_iw) {
      return NextResponse.json({ error: 'Esta matrícula tiene su caso de IW pendiente en la cola: primero autorízalo o descártalo; recién entonces este caso proyecta.' }, { status: 409 })
    }
    // Asignaturas desmarcadas por quien revisa (solo reingreso): el servidor
    // recalcula créditos, tuition y cuotas con la selección — el número que se
    // ve sale siempre del mismo motor, nunca de una copia en el navegador.
    const excluir = (req.nextUrl.searchParams.get('excluir') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const preview = await previewCaso(sb, caso, excluir)
    return NextResponse.json({ preview })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo armar el caso' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null) as { kind?: 'IW' | 'REENTRY' | 'REVERSION'; trigger_id?: string; action?: string; nota?: string; excluir?: string[] } | null
  if (!b?.kind || !b.trigger_id || !b.action) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const sb = db()
  try {
    const casos = await casosPendientes(sb)
    const caso = casos.find(c => c.kind === b.kind && c.trigger_id === b.trigger_id)
    if (!caso) return NextResponse.json({ error: 'Ese caso ya no está pendiente (¿lo aplicó otra persona?)' }, { status: 409 })
    // Descartar un caso bloqueado sí se permite (retirar de la cola una
    // Reversión creada por error no exige resolver antes el IW); aplicar no.
    if (caso.bloqueado_por_iw && b.action !== 'descartar') {
      return NextResponse.json({ error: 'Esta matrícula tiene su caso de IW pendiente: primero autorízalo o descártalo.' }, { status: 409 })
    }

    if (b.action === 'descartar') {
      const nota = (b.nota ?? '').trim()
      if (!nota) return NextResponse.json({ error: 'Descartar exige un motivo' }, { status: 400 })
      const r = await descartarCaso(sb, caso, nota, user.email ?? user.id)
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 500 })
    }

    // Se aplica EXACTAMENTE lo mostrado: la misma selección con la que quien
    // autoriza vio la proyección viaja aquí y el servidor la recalcula al
    // momento de aplicar; lo desmarcado queda en el sello como su decisión.
    const preview = await previewCaso(sb, caso, Array.isArray(b.excluir) ? b.excluir.map(String) : [])
    const r = await aplicarCaso(sb, caso, preview, user.email ?? user.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
    // La situación del estudiante y los conteos derivan del registro: se
    // recalculan ya, no a las 4:45.
    await recomputeSituations(sb).catch(() => null)
    return NextResponse.json({ ok: true, sin_cambios: preview.sin_cambios })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo aplicar' }, { status: 500 })
  }
}
