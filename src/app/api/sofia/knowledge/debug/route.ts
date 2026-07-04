import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { embedText } from '@/lib/embeddings'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/sofia/knowledge/debug?q=...
// Devuelve los fragmentos más parecidos con SU PUNTAJE, sin umbral,
// para diagnosticar por qué la búsqueda no encuentra algo.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')

  // ?inspect=1 → revisa el estado crudo de los embeddings en la BD
  if (req.nextUrl.searchParams.get('inspect') === '1') {
    const { data, error } = await (db() as any)
      .from('sofia_knowledge_chunks')
      .select('id, chunk_index, embedding, content')
      .limit(5)
    if (error) return NextResponse.json({ error: error.message })
    return NextResponse.json({
      total_sample: (data ?? []).length,
      chunks: (data ?? []).map((c: any) => ({
        chunk_index: c.chunk_index,
        embedding_is_null: c.embedding === null,
        embedding_type: typeof c.embedding,
        embedding_preview: typeof c.embedding === 'string'
          ? c.embedding.slice(0, 60)
          : Array.isArray(c.embedding) ? `array(${c.embedding.length})` : String(c.embedding),
        content_preview: c.content?.slice(0, 80),
      })),
    })
  }

  if (!q) return NextResponse.json({ error: 'Pasa ?q=tu pregunta' })

  try {
    const hasKey = !!process.env.OPENAI_API_KEY
    if (!hasKey) return NextResponse.json({ error: 'OPENAI_API_KEY no está configurada en este entorno' })

    const embedding = await embedText(q)

    // Sin umbral (threshold 0) para ver TODOS los puntajes top
    const { data, error } = await (db() as any).rpc('match_sofia_knowledge', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: 0,
      match_count: 10,
    })
    if (error) return NextResponse.json({ error: error.message })

    return NextResponse.json({
      query: q,
      embedding_dims: embedding.length,
      current_threshold: 0.30,
      matches: (data ?? []).map((m: any) => ({
        title: m.title,
        similarity: Number(m.similarity.toFixed(4)),
        passes_threshold: m.similarity > 0.30,
        preview: m.content.slice(0, 200),
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
