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
export async function searchKnowledge(query: string, matchCount = 8): Promise<KnowledgeMatch[]> {
  if (!query?.trim() || !process.env.OPENAI_API_KEY) return []
  try {
    const embedding = await embedText(query)
    const { data, error } = await (db() as any).rpc('match_sofia_knowledge', {
      query_embedding: JSON.stringify(embedding),
      // Umbral más permisivo: preferimos traer contexto cercano y dejar que
      // Sofia interprete, en vez de no encontrar nada por una diferencia de fraseo.
      match_threshold: 0.20,
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
La siguiente información oficial fue recuperada como la MÁS RELEVANTE a la consulta del usuario. Úsala así:

1. Si responde directamente la pregunta, contesta con seguridad y de forma natural.
2. INTERPRETA la intención del usuario. La gente no conoce los nombres exactos de cargos, áreas ni trámites. Si preguntan "quién está a cargo del servicio al estudiante" y aquí dice "Director de Servicio al Estudiante: X", ESA es la respuesta — dala.
3. Si lo que preguntan se PARECE a algo que está aquí pero no es idéntico, ofrécelo proactivamente en lugar de decir que no sabes. Ejemplo: "Quizá te refieres al Director de Servicio al Estudiante, Rober Aphang. Si buscabas otro cargo o área, dime y te ayudo."
4. Solo di que no tienes el dato si REALMENTE nada de lo de abajo se relaciona con la pregunta. No seas excesivamente cauteloso: si el dato está aquí, úsalo; no lo inventes si no está.

${blocks}
=================================`
}
