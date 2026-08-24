import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reindexArticle } from '@/app/api/sofia/knowledge/route'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Mantenimiento: reindexa los embeddings de artículos de conocimiento cuyo
// contenido se corrigió por fuera de la pantalla (auditorías de coherencia,
// correcciones masivas). Los embeddings solo pueden calcularse aquí porque la
// clave de OpenAI vive en Vercel.
//   POST { ids: [uuid, ...] }  → reindexa esos artículos
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const b = await req.json().catch(() => null) as { ids?: string[] } | null
  const ids = (b?.ids ?? []).filter(Boolean)
  if (!ids.length) return NextResponse.json({ error: 'Faltan ids' }, { status: 400 })
  const sb = db()
  const out: Record<string, number | string> = {}
  for (const id of ids) {
    const { data } = await sb.from('sofia_knowledge').select('id, content').eq('id', id).maybeSingle()
    if (!data) { out[id] = 'no existe'; continue }
    try { out[id] = await reindexArticle(id, data.content ?? '') }
    catch (e) { out[id] = e instanceof Error ? e.message : 'error' }
  }
  return NextResponse.json({ ok: true, reindexed: out })
}
