import { createClient } from '@supabase/supabase-js'
import { embedText } from './embeddings'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface KnowledgeMatch {
  chunk_id: string
  knowledge_id: string
  title: string
  content: string
  similarity: number
}

/**
 * Busca en la base de conocimientos los fragmentos más relevantes a la consulta.
 * Devuelve [] si no hay OPENAI_API_KEY, si falla la búsqueda, o si no hay coincidencias.
 * Nunca lanza — el chat debe seguir funcionando aunque la KB falle.
 */
export async function searchKnowledge(query: string, matchCount = 5): Promise<KnowledgeMatch[]> {
  if (!query?.trim() || !process.env.OPENAI_API_KEY) return []
  try {
    const embedding = await embedText(query)
    const { data, error } = await (db() as any).rpc('match_sofia_knowledge', {
      query_embedding: embedding,
      match_threshold: 0.30,
      match_count: matchCount,
    })
    if (error) {
      console.error('searchKnowledge RPC error:', error.message)
      return []
    }
    return (data ?? []) as KnowledgeMatch[]
  } catch (err) {
    console.error('searchKnowledge error:', err)
    return []
  }
}

/**
 * Recupera conocimiento relevante y lo formatea como bloque para inyectar al system prompt.
 * Devuelve '' si no hay coincidencias.
 */
export async function buildKnowledgeContext(query: string): Promise<string> {
  const matches = await searchKnowledge(query)
  if (matches.length === 0) return ''

  const blocks = matches
    .map((m, i) => `[Fuente ${i + 1}: ${m.title}]\n${m.content}`)
    .join('\n\n')

  return `
=== BASE DE CONOCIMIENTOS BGU ===
Usa la siguiente información oficial para responder con precisión. Si la respuesta está aquí, básate en ella y cítala de forma natural. Si la pregunta no se cubre aquí y no la sabes, dilo con honestidad en lugar de inventar.

${blocks}
=================================`
}
