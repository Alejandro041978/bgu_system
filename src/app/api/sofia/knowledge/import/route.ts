import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { chunkText, embedTexts } from '@/lib/embeddings'

export const maxDuration = 300

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ImportRecord { title?: string; content?: string; category?: string | null }

// POST { records: [{ title, content, category }] }
// Importa en lote: inserta artículos, genera chunks + embeddings en batch, inserta chunks.
// Omite artículos cuyo título ya existe (para que reimportar sea seguro).
export async function POST(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { records, bot } = await req.json() as { records: ImportRecord[]; bot?: string }
    const botKey = bot ?? 'sofia'
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'No se recibieron registros' }, { status: 400 })
    }

    const sb = db() as any

    // Filtrar válidos y quitar los que ya existen por título (dentro del mismo bot)
    const valid = records.filter(r => r.title?.trim() && r.content?.trim())
    const { data: existing } = await sb.from('sofia_knowledge').select('title').eq('bot_key', botKey)
    const existingTitles = new Set((existing ?? []).map((r: any) => (r.title ?? '').trim()))
    const toImport = valid.filter(r => !existingTitles.has(r.title!.trim()))
    const skipped = valid.length - toImport.length

    if (toImport.length === 0) {
      return NextResponse.json({ imported: 0, skipped, chunks: 0, message: 'Todos los registros ya existían.' })
    }

    // 1. Insertar artículos (una sola sentencia → orden preservado en la respuesta)
    const { data: inserted, error: insErr } = await sb
      .from('sofia_knowledge')
      .insert(toImport.map(r => ({
        title: r.title!.trim(),
        content: r.content,
        category: r.category ?? null,
        enabled: true,
        bot_key: botKey,
      })))
      .select('id')
    if (insErr) throw new Error(insErr.message)

    // 2. Construir chunks de todos los artículos
    const allChunks: { knowledge_id: string; content: string; chunk_index: number }[] = []
    inserted.forEach((row: any, i: number) => {
      const chunks = chunkText(toImport[i].content!)
      chunks.forEach((c, ci) => allChunks.push({ knowledge_id: row.id, content: c, chunk_index: ci }))
    })

    // 3. Embeddings en lotes de 100
    const embeddings: number[][] = []
    for (let j = 0; j < allChunks.length; j += 100) {
      const slice = allChunks.slice(j, j + 100)
      const embs = await embedTexts(slice.map(c => c.content))
      embeddings.push(...embs)
    }

    // 4. Insertar chunks (vector como string) en lotes de 200
    const chunkRows = allChunks.map((c, idx) => ({ ...c, embedding: JSON.stringify(embeddings[idx]) }))
    for (let j = 0; j < chunkRows.length; j += 200) {
      const { error: ce } = await sb.from('sofia_knowledge_chunks').insert(chunkRows.slice(j, j + 200))
      if (ce) throw new Error(ce.message)
    }

    // 5. Actualizar chunk_count por artículo
    const counts: Record<string, number> = {}
    allChunks.forEach(c => { counts[c.knowledge_id] = (counts[c.knowledge_id] ?? 0) + 1 })
    await Promise.all(
      Object.entries(counts).map(([id, n]) =>
        sb.from('sofia_knowledge').update({ chunk_count: n }).eq('id', id)
      )
    )

    return NextResponse.json({ imported: toImport.length, skipped, chunks: allChunks.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
