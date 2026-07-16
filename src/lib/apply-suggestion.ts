import { createClient } from '@supabase/supabase-js'
import { chunkText, embedTexts } from './embeddings'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Genera fragmentos + embeddings de un artículo de conocimiento. Sin embeddings
// el RAG nunca lo encuentra. Se repite aquí (en vez de importar de un route.ts)
// porque importar entre rutas ya rompió el build de Vercel.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function indexKnowledge(sb: any, id: string, content: string): Promise<number> {
  await sb.from('sofia_knowledge_chunks').delete().eq('knowledge_id', id)
  const chunks = chunkText(content)
  if (!chunks.length) { await sb.from('sofia_knowledge').update({ chunk_count: 0 }).eq('id', id); return 0 }
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

const MEJORAS_HEADER = '═══ MEJORAS APROBADAS POR EL SUPERVISOR ═══'

export interface Suggestion {
  id: string
  bot_key: string
  type: 'prompt' | 'knowledge'
  title: string
  content: string
  kb_topic?: string | null
  kb_question?: string | null
  kb_tags?: string | null
}

// Aplica una sugerencia aprobada: la incorpora de verdad al bot.
//   prompt    → agrega el texto al prompt del bot, bajo una sección gestionada
//               (agrupada y fácil de revisar/podar; no se pisa nada existente).
//   knowledge → crea un artículo en la base del bot y lo indexa (embeddings).
// Devuelve una referencia de lo aplicado, para el registro de auditoría.
export async function applySuggestion(s: Suggestion): Promise<{ ref: string }> {
  const sb = db()

  if (s.type === 'prompt') {
    const { data: bot } = await sb.from('bots').select('prompt').eq('key', s.bot_key).maybeSingle()
    if (!bot) throw new Error(`Bot ${s.bot_key} no encontrado`)
    const current: string = bot.prompt ?? ''
    const line = `\n\n• ${s.content.trim()}`
    // Todas las mejoras aprobadas viven agrupadas al final del prompt, para que
    // se puedan revisar y podar de un vistazo sin buscarlas entre el texto base.
    const next = current.includes(MEJORAS_HEADER)
      ? current + line
      : `${current}\n\n${MEJORAS_HEADER}${line}`
    const { error } = await sb.from('bots').update({ prompt: next, updated_at: new Date().toISOString() }).eq('key', s.bot_key)
    if (error) throw new Error(error.message)
    return { ref: 'prompt' }
  }

  // knowledge
  const title = s.kb_question?.trim() || s.title
  const category = s.kb_topic?.trim() || 'Supervisor'
  const body = s.content + (s.kb_tags ? `\n\nPalabras clave: ${s.kb_tags}` : '')

  // No duplicar si ya existe ese artículo para el bot.
  const { data: dup } = await sb.from('sofia_knowledge')
    .select('id').eq('bot_key', s.bot_key).eq('title', title).maybeSingle()
  if (dup) { await indexKnowledge(sb, dup.id, body); return { ref: dup.id } }

  const { data: row, error } = await sb.from('sofia_knowledge')
    .insert({ title, content: body, category, bot_key: s.bot_key, enabled: true })
    .select('id').single()
  if (error) throw new Error(error.message)
  await indexKnowledge(sb, row.id, body)
  return { ref: row.id }
}
