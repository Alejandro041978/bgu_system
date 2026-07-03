import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = supabase as any

  // Date range: yesterday (or override with query param)
  const url = new URL(req.url)
  const dateParam = url.searchParams.get('date')
  const targetDate = dateParam ? new Date(dateParam) : new Date(Date.now() - 86_400_000)
  const dateStr = targetDate.toISOString().slice(0, 10)
  const startOfDay = `${dateStr}T00:00:00.000Z`
  const endOfDay = `${dateStr}T23:59:59.999Z`

  // Fetch conversations from target date
  const { data: conversations, error } = await db
    .from('sofia_conversations')
    .select('session_id, messages, message_count, source, contact_email, created_at')
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const convList = conversations ?? []
  const totalMessages = convList.reduce((s: number, c: any) => s + (c.message_count ?? 0), 0)

  // Mark report as pending
  await db.from('sofia_supervisor_reports').upsert({
    report_date: dateStr,
    conversations_analyzed: convList.length,
    total_messages: totalMessages,
    status: 'pending',
  }, { onConflict: 'report_date' })

  if (convList.length === 0) {
    await db.from('sofia_supervisor_reports').update({
      status: 'completed',
      executive_summary: 'No hubo conversaciones en este período.',
      full_report: `REPORTE SUPERVISOR SOFIA - ${dateStr}\n\nNo se registraron conversaciones.`,
      generated_at: new Date().toISOString(),
    }).eq('report_date', dateStr)
    return NextResponse.json({ ok: true, conversations: 0 })
  }

  // Get current Sofia prompt
  const { data: promptRow } = await db.from('ai_master_prompt').select('prompt').eq('id', 1).single()
  const currentPrompt = promptRow?.prompt ?? ''

  // Format conversations for analysis
  const convSamples = convList.slice(0, 50).map((c: any, i: number) => {
    const msgs = (c.messages as { role: string; content: string }[]) ?? []
    const preview = msgs
      .filter(m => m.content)
      .map(m => `  [${m.role === 'user' ? 'Usuario' : 'Sofia'}]: ${m.content.slice(0, 400)}`)
      .join('\n')
    return `--- Conversación ${i + 1} (${c.source ?? 'web'}, ${new Date(c.created_at).toLocaleTimeString('es-PE')}) ---\n${preview}`
  }).join('\n\n')

  // Source breakdown
  const sourceMap: Record<string, number> = {}
  for (const c of convList) {
    const s = (c as any).source ?? 'web'
    sourceMap[s] = (sourceMap[s] ?? 0) + 1
  }

  const analysisPrompt = `Eres un supervisor experto en calidad de atención al cliente para una universidad. Analiza las conversaciones del chatbot Sofia de Blackwell Global University (BGU) del día ${dateStr} y genera un reporte estructurado.

PROMPT ACTUAL DE SOFIA:
---
${currentPrompt.slice(0, 3000)}
---

ESTADÍSTICAS DEL DÍA:
- Total conversaciones: ${convList.length}
- Total mensajes: ${totalMessages}
- Canales: ${Object.entries(sourceMap).map(([s, n]) => `${s}(${n})`).join(', ')}
- Promedio mensajes/conversación: ${(totalMessages / convList.length).toFixed(1)}

MUESTRA DE CONVERSACIONES (${Math.min(convList.length, 50)} de ${convList.length}):
${convSamples}

---

Genera un reporte COMPLETO con las siguientes secciones. Usa formato de texto plano (no markdown):

SECCIÓN 1 - RESUMEN EJECUTIVO (2-3 párrafos):
Qué fue bien, qué falló, tendencia general del día.

SECCIÓN 2 - FORTALEZAS IDENTIFICADAS:
Lista numerada de lo que Sofia hizo correctamente.

SECCIÓN 3 - DEBILIDADES Y FALLOS:
Lista numerada de errores, confusiones o respuestas inadecuadas detectadas.

SECCIÓN 4 - TEMAS FRECUENTES:
Top 5 temas más consultados con frecuencia estimada.

SECCIÓN 5 - RECOMENDACIONES PARA EL PROMPT:
Cambios concretos y específicos que se deben hacer al prompt para mejorar a Sofia. Incluye el texto exacto sugerido para cada cambio.

SECCIÓN 6 - SCORE DE CALIDAD:
Puntuación del 1 al 10 con justificación breve.

Responde con JSON con esta estructura exacta:
{
  "executive_summary": "texto",
  "strengths": "texto",
  "weaknesses": "texto",
  "frequent_topics": "texto",
  "recommendations": "texto",
  "quality_score": 8,
  "quality_justification": "texto"
}`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  let result: {
    executive_summary: string
    strengths: string
    weaknesses: string
    frequent_topics: string
    recommendations: string
    quality_score: number
    quality_justification: string
  }

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{ role: 'user', content: analysisPrompt }],
    })
    const text = message.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    result = JSON.parse(jsonMatch[0])
  } catch (err) {
    await db.from('sofia_supervisor_reports').update({
      status: 'failed',
      generated_at: new Date().toISOString(),
    }).eq('report_date', dateStr)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  const fullReport = `REPORTE SUPERVISOR SOFIA - ${dateStr}
${'='.repeat(50)}
Conversaciones analizadas: ${convList.length} | Mensajes totales: ${totalMessages}
Score de calidad: ${result.quality_score}/10

RESUMEN EJECUTIVO
-----------------
${result.executive_summary}

FORTALEZAS
----------
${result.strengths}

DEBILIDADES Y FALLOS
--------------------
${result.weaknesses}

TEMAS FRECUENTES
----------------
${result.frequent_topics}

RECOMENDACIONES PARA EL PROMPT
-------------------------------
${result.recommendations}

JUSTIFICACIÓN DEL SCORE
------------------------
${result.quality_justification}

Generado: ${new Date().toLocaleString('es-PE')}
`

  await db.from('sofia_supervisor_reports').update({
    status: 'completed',
    executive_summary: result.executive_summary,
    strengths: result.strengths,
    weaknesses: result.weaknesses,
    recommendations: result.recommendations,
    prompt_suggestions: result.frequent_topics,
    full_report: fullReport,
    quality_score: result.quality_score,
    generated_at: new Date().toISOString(),
  }).eq('report_date', dateStr)

  return NextResponse.json({ ok: true, conversations: convList.length, score: result.quality_score })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
