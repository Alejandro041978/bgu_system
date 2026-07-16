import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chunkText, embedTexts } from '@/lib/embeddings'

export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Carga entradas a la base de un bot, generando sus fragmentos + embeddings.
// Sin embeddings el RAG nunca las encuentra: la fila existiría pero sería
// invisible para el bot.
//
// La clave de OpenAI vive sólo en Vercel, así que esto tiene que correr en el
// servidor. Va con CRON_SECRET.
//
// Body: { bot_key, copy_ids?: string[], entries?: [{title, content, category}] }
//   copy_ids → duplica entradas existentes (p.ej. de Sofía) para otro bot
//   entries  → crea entradas nuevas
//
// La lógica de indexado se repite a propósito en vez de importar
// reindexArticle desde el route.ts vecino: importar entre rutas ya rompió el
// build de Vercel una vez.
async function indexar(id: string, content: string): Promise<number> {
  const sb = db()
  await sb.from('sofia_knowledge_chunks').delete().eq('knowledge_id', id)
  const chunks = chunkText(content)
  if (!chunks.length) {
    await sb.from('sofia_knowledge').update({ chunk_count: 0 }).eq('id', id)
    return 0
  }
  const embeddings = await embedTexts(chunks)
  const rows = chunks.map((c, i) => ({
    knowledge_id: id, content: c, chunk_index: i,
    embedding: JSON.stringify(embeddings[i]),   // pgvector quiere texto "[0.1,...]"
  }))
  const { error } = await sb.from('sofia_knowledge_chunks').insert(rows)
  if (error) throw new Error(error.message)
  await sb.from('sofia_knowledge').update({ chunk_count: chunks.length }).eq('id', id)
  return chunks.length
}

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null) as {
    bot_key?: string
    copy_ids?: string[]
    entries?: { title: string; content: string; category?: string }[]
  } | null
  if (!body?.bot_key) return NextResponse.json({ error: 'bot_key requerido' }, { status: 400 })

  const sb = db()
  const nuevas: { title: string; content: string; category: string | null }[] = []

  if (body.copy_ids?.length) {
    const { data, error } = await sb.from('sofia_knowledge')
      .select('title, content, category').in('id', body.copy_ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    nuevas.push(...(data ?? []))
  }
  for (const e of body.entries ?? []) {
    if (e.title && e.content) nuevas.push({ title: e.title, content: e.content, category: e.category ?? null })
  }
  if (!nuevas.length) return NextResponse.json({ error: 'Nada que cargar' }, { status: 400 })

  const creadas: string[] = []
  const errores: string[] = []
  for (const n of nuevas) {
    // No duplicar si ya existe ese título para el bot
    const { data: ya } = await sb.from('sofia_knowledge')
      .select('id').eq('bot_key', body.bot_key).eq('title', n.title).maybeSingle()
    if (ya) { errores.push(`ya existía: ${n.title.slice(0, 50)}`); continue }

    const { data: row, error } = await sb.from('sofia_knowledge')
      .insert({ title: n.title, content: n.content, category: n.category, bot_key: body.bot_key, enabled: true })
      .select('id').single()
    if (error) { errores.push(`${n.title.slice(0, 40)}: ${error.message}`); continue }
    try {
      const c = await indexar(row.id, n.content)
      creadas.push(`${n.title.slice(0, 60)} (${c} fragmentos)`)
    } catch (e) {
      errores.push(`${n.title.slice(0, 40)}: indexado falló — ${(e as Error).message}`)
    }
  }

  return NextResponse.json({ ok: errores.length === 0, creadas: creadas.length, detalle: creadas, errores })
}
