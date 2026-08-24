import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { resolveEligibility } from '@/lib/campaign-resolver'
import { computeOutcomes, OUTCOME_LABEL, type ContactRow } from '@/lib/campaign-outcomes'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0

const CAMPAIGN_KEYS = ['titulacion', 'cobranza', 'cashpay', 'ausente', 'iw', 'loa'] as const

// ---------------------------------------------------------------------------
// Detalle de UNA campaña de Camila, en su propia ruta para poder darle su
// propio permiso de página (campaign_<key>): cada campaña la sigue una persona
// distinta de la empresa (regla del usuario, 23/08/2026). El tablero global
// (/campaigns) sigue siendo la vista de conjunto y el interruptor.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const { key } = await params
  if (!(CAMPAIGN_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: 'Campaña desconocida' }, { status: 404 })
  }
  const sb = db()
  const dias = Number(req.nextUrl.searchParams.get('dias') ?? 0)
  const desde = dias > 0 ? new Date(Date.now() - dias * 864e5).toISOString() : null

  const { campaigns, assignments } = await resolveEligibility(sb)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = campaigns.find(c => c.key === key) as any
  if (!def) return NextResponse.json({ error: 'Campaña no configurada' }, { status: 404 })

  // Contactos de ESTA campaña
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactos: any[] = []
  for (let f = 0; ; f += 1000) {
    const { data } = await sb.from('campaign_contacts')
      .select('student_id, campaign_key, sent_at, status, replied_at, template_key, language, error, note, reason')
      .eq('campaign_key', key).order('sent_at', { ascending: false }).range(f, f + 999)
    contactos.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const enVentana = desde ? contactos.filter(c => String(c.sent_at) >= desde) : contactos
  const validos = enVentana.filter(c => c.status !== 'failed')
  const exitosos = await computeOutcomes(sb, validos as ContactRow[])

  // Nombres para la lista (el seguimiento es por persona)
  const ids = [...new Set(enVentana.map(c => String(c.student_id)))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nombre = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, phone_number, situation')
      .in('id', ids.slice(i, i + 150))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (data ?? []) as any[]) nombre.set(String(s.id), s)
  }

  const cola = assignments.filter(a => a.campaign_key === key)
  const contactados = new Set(validos.map(c => String(c.student_id)))
  const respondieron = new Set(validos.filter(c => c.replied_at).map(c => String(c.student_id)))
  const exito = [...contactados].filter(id => exitosos.has(id)).length

  // Una fila por estudiante (el último toque manda); los fallidos se listan aparte
  const vistos = new Set<string>()
  const filas = enVentana.filter(c => {
    const id = String(c.student_id)
    if (vistos.has(id)) return false
    vistos.add(id)
    return true
  }).map(c => {
    const s = nombre.get(String(c.student_id))
    return {
      student_id: c.student_id,
      name: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ') : '—',
      document: s?.document_number ?? null,
      situation: s?.situation ?? null,
      sent_at: c.sent_at, status: c.status, replied_at: c.replied_at,
      exito: exitosos.has(String(c.student_id)),
      toques: enVentana.filter(x => String(x.student_id) === String(c.student_id)).length,
      error: c.status === 'failed' ? (c.error ?? null) : null,
      note: c.note ?? c.reason ?? null,
    }
  })

  return NextResponse.json({
    campaign: {
      key, nombre: def.name, descripcion: def.description ?? null, activa: def.active,
      cupo_diario: Number(def.daily_cap ?? 10), bot: def.bot_key ?? 'retencion',
      plantilla: def.template_key ?? `camila_${key}`,
    },
    funnel: {
      elegibles: cola.length,
      en_cola: cola.filter(a => !contactados.has(String(a.student_id))).length,
      contactados: contactados.size,
      respondieron: respondieron.size,
      exito, exito_label: OUTCOME_LABEL[key] ?? 'Resultado',
      tasa_respuesta: pct(respondieron.size, contactados.size),
      tasa_exito: pct(exito, contactados.size),
    },
    rows: filas,
    periodo: { dias, desde },
  })
}
