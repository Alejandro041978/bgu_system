import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST { withdrawal_id } — crea una REVERSIÓN: el reingreso ADMINISTRATIVO de
// un IW, sin pago (regla del usuario, 03/09/2026). No aplica nada: encola el
// caso en el Gestor de IW/Re-Entry, donde se proyecta igual que un Re-Entry y
// se autoriza con vista previa, respaldo y sello. Solo existe para IW VIGENTES
// y solo la crea el personal desde Retiros — el estudiante sigue teniendo su
// vía pagada (trámite Re-entry, $35).
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const b = await req.json().catch(() => null) as { withdrawal_id?: string } | null
  if (!b?.withdrawal_id) return NextResponse.json({ error: 'Falta withdrawal_id' }, { status: 400 })

  const sb = db()
  const { data: w } = await sb.from('student_withdrawals')
    .select('id, student_id, type, status, resolution_number').eq('id', b.withdrawal_id).maybeSingle()
  if (!w) return NextResponse.json({ error: 'Retiro no encontrado' }, { status: 404 })
  if (w.type !== 'IW') return NextResponse.json({ error: 'La Reversión es solo para IW (el LOA se reincorpora directo desde Retiros).' }, { status: 400 })
  if (w.status !== 'vigente') return NextResponse.json({ error: `Este IW no está vigente (figura "${w.status}"): no hay nada que revertir.` }, { status: 409 })

  // Una sola gestión por retiro: si ya hay una Reversión (pendiente, aplicada
  // o descartada) para este IW, no se crea otra — el UNIQUE lo garantiza y
  // aquí se explica antes del error críptico.
  const { data: previa } = await sb.from('iw_reentry_gestiones')
    .select('status, applied_by, applied_at').eq('kind', 'REVERSION').eq('trigger_id', w.id).maybeSingle()
  if (previa) {
    const que = previa.status === 'pendiente'
      ? 'Ya hay una Reversión de este IW esperando en el Gestor de IW/Re-Entry.'
      : `Este IW ya tuvo una Reversión ${previa.status === 'aplicado' ? 'aplicada' : 'descartada'} por ${previa.applied_by ?? '—'}.`
    return NextResponse.json({ error: que }, { status: 409 })
  }

  const quien = user.email ?? user.id
  const { error } = await sb.from('iw_reentry_gestiones').insert({
    student_id: w.student_id, kind: 'REVERSION', trigger_id: w.id, status: 'pendiente',
    nota: `Creada desde Retiros por ${quien} el ${new Date().toISOString().slice(0, 10)} (IW ${w.resolution_number ?? 'sin resolución'})`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, mensaje: 'Reversión creada: revísala y autorízala en el Gestor de IW/Re-Entry.' })
}
