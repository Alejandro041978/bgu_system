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

// Palabras vacías que no aportan a la búsqueda por palabra clave
const STOPWORDS = new Set([
  'sabes','quien','quién','cual','cuál','como','cómo','donde','dónde','cuando','cuándo',
  'para','porque','sobre','este','esta','esto','esos','esas','tiene','hace','hacer','está',
  'universidad','institucion','institución','favor','hola','gracias','puedes','quiero','saber',
  'necesito','buenas','noches','dias','días','tardes','algunas','cosas','algo','sabe','cargo',
  'nombre','persona','responsable','encargado','area','área',
])

function extractKeywords(query: string): string[] {
  const words = query.toLowerCase().match(/[a-záéíóúñü]{4,}/gi) ?? []
  return [...new Set(words)].filter(w => !STOPWORDS.has(w)).slice(0, 6)
}

/** Búsqueda vectorial (semántica) por embeddings. */
async function vectorSearch(query: string, matchCount: number): Promise<KnowledgeMatch[]> {
  if (!process.env.OPENAI_API_KEY) return []
  try {
    const embedding = await embedText(query)
    const { data, error } = await (db() as any).rpc('match_sofia_knowledge', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: 0.20,
      match_count: matchCount,
    })
    if (error) { console.error('vectorSearch RPC error:', error.message); return [] }
    return (data ?? []) as KnowledgeMatch[]
  } catch (err) {
    console.error('vectorSearch error:', err)
    return []
  }
}

/** Búsqueda por palabra clave (literal) — confiable para nombres, cargos y trámites. */
async function keywordSearch(query: string): Promise<KnowledgeMatch[]> {
  const kws = extractKeywords(query)
  if (kws.length === 0) return []
  try {
    const orFilter = kws.map(w => `content.ilike.%${w}%`).join(',')
    const { data, error } = await (db() as any)
      .from('sofia_knowledge')
      .select('id, title, content')
      .eq('enabled', true)
      .or(orFilter)
      .limit(5)
    if (error) { console.error('keywordSearch error:', error.message); return [] }
    return (data ?? []).map((a: any) => ({
      chunk_id: a.id, knowledge_id: a.id, title: a.title, content: a.content, similarity: 1,
    })) as KnowledgeMatch[]
  } catch (err) {
    console.error('keywordSearch error:', err)
    return []
  }
}

/**
 * Búsqueda HÍBRIDA: combina búsqueda semántica (vector) + palabra clave (literal).
 * La palabra clave rescata nombres/cargos exactos; el vector aporta cercanía semántica.
 * Nunca lanza — el chat debe seguir funcionando aunque la KB falle.
 */
export async function searchKnowledge(query: string, matchCount = 8): Promise<KnowledgeMatch[]> {
  if (!query?.trim()) return []
  const [vec, kw] = await Promise.all([
    vectorSearch(query, matchCount),
    keywordSearch(query),
  ])
  // La palabra clave (artículos completos) tiene prioridad; luego se agregan
  // los fragmentos vectoriales de OTROS artículos no cubiertos por palabra clave.
  const kwIds = new Set(kw.map(m => m.knowledge_id))
  const merged = [...kw, ...vec.filter(m => !kwIds.has(m.knowledge_id))]
  return merged.slice(0, matchCount)
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
