import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { wdb, nextResolutionNumber, recomputeSituations } from '@/lib/withdrawals'

export const maxDuration = 120

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// PATCH → avanzar el expediente. El caso importante es resolverlo:
//   outcome='revertido'  → el estudiante se queda. NO se genera retiro.
//   outcome='LOA' | 'IW_*' → se genera el retiro con su número de resolución.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null) as {
    stage?: string; assigned_to?: string; call_notes?: string
    outcome?: string; refund_requested?: boolean; resolution_number?: string; withdrawal_date?: string
  } | null
  if (!body) return NextResponse.json({ error: 'Cuerpo requerido' }, { status: 400 })

  const sb = wdb()
  const { data: reqRow } = await sb.from('withdrawal_requests').select('*').eq('id', id).maybeSingle()
  if (!reqRow) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  if (reqRow.withdrawal_id) return NextResponse.json({ error: 'Esta solicitud ya generó un retiro' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const k of ['stage', 'assigned_to', 'call_notes', 'refund_requested']) if (k in body) patch[k] = body[k as keyof typeof body]
  if (body.stage === 'llamada_realizada' && !reqRow.call_at) patch.call_at = new Date().toISOString()

  // --- Resolver ---
  if (body.outcome) {
    const OUT = ['revertido', 'LOA', 'IW_voluntario', 'IW_administrativo']
    if (!OUT.includes(body.outcome)) return NextResponse.json({ error: 'outcome inválido' }, { status: 400 })

    patch.outcome = body.outcome
    patch.stage = 'resuelto'
    patch.resolved_by = user.id
    patch.resolved_at = new Date().toISOString()
    patch.call_at = reqRow.call_at ?? new Date().toISOString()

    if (body.outcome !== 'revertido') {
      // Genera el retiro. 'revertido' no genera nada: el estudiante se queda.
      const type = body.outcome === 'LOA' ? 'LOA' : 'IW'
      const subtype = body.outcome === 'IW_voluntario' ? 'voluntario'
        : body.outcome === 'IW_administrativo' ? 'administrativo' : null
      const date = body.withdrawal_date || new Date().toISOString().slice(0, 10)
      const resolution = body.resolution_number || await nextResolutionNumber(sb, reqRow.student_id, type, date)

      let expires: string | null = null
      if (type === 'LOA') {
        const d = new Date(date + 'T00:00:00Z')
        d.setUTCMonth(d.getUTCMonth() + 6)
        expires = d.toISOString().slice(0, 10)
      }

      const { data: wd, error: wErr } = await sb.from('student_withdrawals').insert({
        student_id: reqRow.student_id, type, subtype, resolution_number: resolution,
        withdrawal_date: date, expires_at: expires, status: 'vigente', source: 'erp',
        reason: reqRow.reason ?? null, note: body.call_notes ?? reqRow.call_notes ?? null,
        created_by: user.id,
      }).select('id').single()
      if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })
      patch.withdrawal_id = wd.id
    }
  }

  const { error } = await sb.from('withdrawal_requests').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.outcome) await recomputeSituations(sb)
  return NextResponse.json({ ok: true })
}
