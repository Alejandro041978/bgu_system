import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Reconciliación: ¿llegaron TODOS los correos al buzón?
//
// El buzón es el destino: sólo sabe lo que N8N le entregó, y es ciego a lo que
// hay en Gmail. Un correo que Gmail recibe pero N8N nunca reenvía desaparece sin
// rastro. La única forma de detectarlo es comparar la fuente contra el destino.
//
// N8N lista los IDs de mensaje de Gmail de una ventana (p.ej. últimas 48h) y los
// manda aquí. Este endpoint responde cuáles FALTAN en el buzón. Con esa lista,
// N8N puede reenviar sólo esos al endpoint de ingesta (auto-reparación).
//
// Body: { message_ids: string[] }   (los Message-Id de Gmail de la ventana)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null) as { message_ids?: string[] } | null
  const ids = (body?.message_ids ?? []).filter(Boolean)
  if (!ids.length) return NextResponse.json({ error: 'Se espera { message_ids: [...] }' }, { status: 400 })

  const sb = db()

  // Qué IDs de esa ventana YA están en el buzón (chunked: .in() con cientos de
  // valores puede pasar el límite de PostgREST).
  const presentes = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data } = await sb.from('wa_messages').select('message_id').in('message_id', chunk)
    for (const r of (data ?? []) as { message_id: string }[]) if (r.message_id) presentes.add(r.message_id)
  }

  const faltantes = ids.filter(id => !presentes.has(id))
  return NextResponse.json({
    revisados: ids.length,
    en_buzon: presentes.size,
    faltantes: faltantes.length,
    // Los que Gmail tiene y el buzón no: nunca llegaron. N8N debe reenviarlos.
    ids_faltantes: faltantes,
  })
}
