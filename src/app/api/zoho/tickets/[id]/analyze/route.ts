import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ZohoComment } from '@/types/zoho'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { conversations } = await request.json() as { conversations: ZohoComment[] }

  if (!conversations?.length) {
    return NextResponse.json({ error: 'No conversations to analyze' }, { status: 400 })
  }

  const conversationText = conversations.map(c =>
    `[${c.authorType === 'agent' ? 'AGENTE' : 'CLIENTE'}] ${c.author}: ${c.content.replace(/<[^>]*>/g, '')}`
  ).join('\n\n')

  const prompt = `Eres un supervisor de calidad de atención al cliente. Analiza la siguiente conversación de soporte y evalúa el desempeño del agente.

CONVERSACIÓN:
${conversationText}

Proporciona un análisis en formato JSON con esta estructura exacta:
{
  "score": <número 0-100, puntaje general del agente>,
  "sentiment": <"positive" | "neutral" | "negative", sentimiento del cliente al final>,
  "response_quality": <"excellent" | "good" | "average" | "poor">,
  "empathy_score": <número 0-100>,
  "resolution_score": <número 0-100>,
  "professionalism_score": <número 0-100>,
  "feedback": <string, evaluación detallada en español del desempeño del agente>,
  "suggestions": <string, sugerencias concretas de mejora en español>
}

Solo responde con el JSON, sin texto adicional.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const analysis = JSON.parse(text)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('ticket_ai_reviews').insert({
      ticket_id: id,
      score: analysis.score,
      sentiment: analysis.sentiment,
      response_quality: analysis.response_quality,
      empathy_score: analysis.empathy_score,
      resolution_score: analysis.resolution_score,
      professionalism_score: analysis.professionalism_score,
      feedback: analysis.feedback,
      suggestions: analysis.suggestions,
    })

    return NextResponse.json({
      score: analysis.score,
      sentiment: analysis.sentiment,
      feedback: analysis.feedback,
      suggestions: analysis.suggestions,
      scores: {
        empathy: analysis.empathy_score,
        resolution: analysis.resolution_score,
        professionalism: analysis.professionalism_score,
      },
    })
  } catch (error) {
    console.error('AI analysis error:', error)
    return NextResponse.json({ error: 'Failed to analyze ticket' }, { status: 500 })
  }
}
