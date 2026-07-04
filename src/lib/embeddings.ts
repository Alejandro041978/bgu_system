// Genera embeddings con OpenAI text-embedding-3-small (1536 dims).
// Requiere la variable de entorno OPENAI_API_KEY.

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'
const MODEL = 'text-embedding-3-small'

/** Genera el embedding de un solo texto. */
export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text])
  return vec
}

/** Genera embeddings para varios textos en una sola llamada (batch). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada')

  const resp = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: texts.map(t => t.replace(/\n/g, ' ').slice(0, 8000)),
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`OpenAI embeddings error ${resp.status}: ${errText}`)
  }

  const json = await resp.json() as { data: { embedding: number[]; index: number }[] }
  // Ordenar por index para garantizar el mismo orden que la entrada
  return json.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
}

/**
 * Divide un texto largo en fragmentos (~chunkSize caracteres) respetando
 * límites de párrafo cuando es posible, con un pequeño solapamiento.
 */
export function chunkText(text: string, chunkSize = 1200, overlap = 150): string[] {
  const clean = text.trim().replace(/\r\n/g, '\n')
  if (clean.length <= chunkSize) return clean ? [clean] : []

  const chunks: string[] = []
  const paragraphs = clean.split(/\n\s*\n/)
  let current = ''

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > chunkSize && current) {
      chunks.push(current.trim())
      // solapamiento: arrastrar el final del chunk anterior
      current = current.slice(-overlap) + '\n\n' + para
    } else {
      current = current ? current + '\n\n' + para : para
    }
    // Si un solo párrafo excede el tamaño, partirlo por oraciones
    while (current.length > chunkSize) {
      let cut = current.lastIndexOf('. ', chunkSize)
      if (cut < chunkSize * 0.5) cut = chunkSize
      chunks.push(current.slice(0, cut + 1).trim())
      current = current.slice(cut + 1 - overlap)
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(Boolean)
}
