import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { chunkText, embedTexts } from '@/lib/embeddings'

export const maxDuration = 60

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

/**
 * Regenera los fragmentos + embeddings de un artículo.
 * Borra los chunks anteriores y crea los nuevos.
 */
export async function reindexArticle(id: string, content: string): Promise<number> {
  const sb = db() as any
  await sb.from('sofia_knowledge_chunks').delete().eq('knowledge_id', id)

  const chunks = chunkText(content)
  if (chunks.length === 0) {
    await sb.from('sofia_knowledge').update({ chunk_count: 0 }).eq('id', id)
    return 0
  }

  const embeddings = await embedTexts(chunks)
  const rows = chunks.map((c, i) => ({
    knowledge_id: id,
    content: c,
    chunk_index: i,
    // pgvector espera el formato de texto "[0.1,0.2,...]", NO un array JS.
    embedding: JSON.stringify(embeddings[i]),
  }))

  const { error } = await sb.from('sofia_knowledge_chunks').insert(rows)
  if (error) throw new Error(error.message)

  await sb.from('sofia_knowledge').update({ chunk_count: chunks.length }).eq('id', id)
  return chunks.length
}

// GET — lista de artículos (filtrada por bot)
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const botKey = req.nextUrl.searchParams.get('bot') ?? 'sofia'
  const { data, error } = await (db() as any)
    .from('sofia_knowledge')
    .select('id, title, category, enabled, chunk_count, updated_at')
    .eq('bot_key', botKey)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ articles: data ?? [] })
}

// POST — crear artículo (+ indexar)
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { title, content, category, enabled, bot } = await req.json() as {
      title?: string; content?: string; category?: string; enabled?: boolean; bot?: string
    }
    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'Título y contenido son obligatorios' }, { status: 400 })
    }

    const { data, error } = await (db() as any)
      .from('sofia_knowledge')
      .insert({ title: title.trim(), content, category: category ?? null, enabled: enabled ?? true, bot_key: bot ?? 'sofia' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const chunks = await reindexArticle(data.id, content)
    return NextResponse.json({ ok: true, id: data.id, chunks })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
