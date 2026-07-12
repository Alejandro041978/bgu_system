import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Ejecuta el análisis del supervisor para un bot y fecha. Reutilizable en proceso
// (sin salto HTTP) desde el cron y desde run-supervisor, evitando apilar dos
// timeouts de función.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function analyzeSupervisor(botKey: string, dateParam?: string | null): Promise<{ status: number; body: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const targetDate = dateParam ? new Date(dateParam) : new Date(Date.now() - 86_400_000)
  const dateStr = targetDate.toISOString().slice(0, 10)
  const startOfDay = `${dateStr}T00:00:00.000Z`
  const endOfDay = `${dateStr}T23:59:59.999Z`

  // Datos del bot (nombre, rol, prompt)
  const { data: botRow } = await db.from('bots').select('name, role, prompt').eq('key', botKey).maybeSingle()
  const botName = botRow?.name ?? 'Sofia'
  const botRole = botRow?.role ?? 'soporte'
  const currentPrompt = botRow?.prompt ?? ''

  // Fetch conversations from target date (de este bot)
  const { data: conversations, error } = await db
    .from('sofia_conversations')
    .select('session_id, messages, message_count, source, contact_email, created_at')
    .eq('bot_key', botKey)
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
    .order('created_at', { ascending: true })

  if (error) {
    return { status: 500, body: { error: error.message } }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convList = (conversations ?? []) as any[]
  const totalMessages = convList.reduce((s: number, c: { message_count?: number }) => s + (c.message_count ?? 0), 0)

  // Mark report as pending
  await db.from('sofia_supervisor_reports').upsert({
    report_date: dateStr,
    bot_key: botKey,
    conversations_analyzed: convList.length,
    total_messages: totalMessages,
    status: 'pending',
  }, { onConflict: 'report_date,bot_key' })

  if (convList.length === 0) {
    await db.from('sofia_supervisor_reports').update({
      status: 'completed',
      executive_summary: 'No hubo conversaciones en este período.',
      full_report: `REPORTE SUPERVISOR ${botName.toUpperCase()} - ${dateStr}\n\nNo se registraron conversaciones.`,
      generated_at: new Date().toISOString(),
    }).eq('report_date', dateStr).eq('bot_key', botKey)
    return { status: 200, body: { ok: true, conversations: 0 } }
  }

  // Inventario de la base de conocimientos (títulos) para detectar vacíos
  const { data: kbRows } = await db
    .from('sofia_knowledge')
    .select('title, category')
    .eq('enabled', true)
    .eq('bot_key', botKey)
  const kbInventory = (kbRows ?? []).length > 0
    ? (kbRows ?? []).map((k: { title: string; category?: string }) => `- ${k.title}${k.category ? ` (${k.category})` : ''}`).join('\n')
    : '(La base de conocimientos está vacía)'

  // Formato de conversaciones para el análisis
  const convSamples = convList.slice(0, 50).map((c: { messages?: { role: string; content: string }[]; source?: string; created_at: string }, i: number) => {
    const msgs = c.messages ?? []
    const preview = msgs
      .filter(m => m.content)
      .map(m => `  [${m.role === 'user' ? 'Usuario' : botName}]: ${m.content.slice(0, 400)}`)
      .join('\n')
    return `--- Conversación ${i + 1} (${c.source ?? 'web'}, ${new Date(c.created_at).toLocaleTimeString('es-PE')}) ---\n${preview}`
  }).join('\n\n')

  // Desglose por canal
  const sourceMap: Record<string, number> = {}
  for (const c of convList) {
    const s = c.source ?? 'web'
    sourceMap[s] = (sourceMap[s] ?? 0) + 1
  }

  const isSales = botRole === 'ventas'
  const isInbox = botRole === 'inbox'

  const analysisPrompt = isInbox
    ? `Eres un supervisor de calidad del equipo HUMANO de Servicio al Estudiante de Blackwell Global University (BGU). Analiza las conversaciones atendidas por AGENTES HUMANOS (canal WhatsApp y correo) del día ${dateStr} y evalúa la calidad de la atención.

En las conversaciones, "Usuario" es el estudiante/cliente y "${botName}" representa las respuestas del AGENTE HUMANO del equipo.

ESTADÍSTICAS DEL DÍA:
- Total conversaciones atendidas: ${convList.length}
- Total mensajes: ${totalMessages}
- Canales: ${Object.entries(sourceMap).map(([s, n]) => `${s}(${n})`).join(', ')}
- Promedio mensajes/conversación: ${(totalMessages / convList.length).toFixed(1)}

MUESTRA DE CONVERSACIONES (${Math.min(convList.length, 50)} de ${convList.length}):
${convSamples}

---

Genera un reporte COMPLETO en texto plano (no markdown) con estas secciones:

SECCIÓN 1 - RESUMEN EJECUTIVO (2-3 párrafos): calidad general de la atención del equipo, tiempos y tono, tendencia del día.

SECCIÓN 2 - FORTALEZAS DEL EQUIPO: qué hicieron bien los agentes (claridad, empatía, resolución, seguimiento).

SECCIÓN 3 - DEBILIDADES Y FALLOS: respuestas tardías, incompletas, tono inadecuado, casos sin resolver o sin cierre, información incorrecta.

SECCIÓN 4 - TEMAS FRECUENTES: top 5 motivos de contacto con frecuencia estimada.

SECCIÓN 5 - RECOMENDACIONES PARA EL EQUIPO: acciones concretas para mejorar la atención (protocolos, plantillas de respuesta, escalamientos, capacitación).

SECCIÓN 6 - VACÍOS DE INFORMACIÓN / PROCESOS: casos donde el agente no tuvo la información o el proceso claro para resolver; qué documentar o definir.

SECCIÓN 7 - SCORE DE CALIDAD DE ATENCIÓN (1 al 10) con justificación breve.`
    : isSales
    ? `Eres un supervisor experto en VENTAS y admisiones universitarias. Analiza las conversaciones del bot de ventas ${botName} de Blackwell Global University (BGU) del día ${dateStr} con prospectos, y genera un reporte estructurado enfocado en efectividad comercial.

PROMPT ACTUAL DE ${botName.toUpperCase()}:
---
${currentPrompt.slice(0, 3000)}
---

BASE DE CONOCIMIENTOS COMERCIAL ACTUAL (info de programas que ${botName} tiene documentada):
---
${kbInventory}
---

ESTADÍSTICAS DEL DÍA:
- Total conversaciones (prospectos): ${convList.length}
- Total mensajes: ${totalMessages}
- Canales: ${Object.entries(sourceMap).map(([s, n]) => `${s}(${n})`).join(', ')}
- Promedio mensajes/conversación: ${(totalMessages / convList.length).toFixed(1)}

MUESTRA DE CONVERSACIONES (${Math.min(convList.length, 50)} de ${convList.length}):
${convSamples}

---

Genera un reporte COMPLETO con estas secciones (texto plano, no markdown):

SECCIÓN 1 - RESUMEN EJECUTIVO (2-3 párrafos): desempeño comercial del día, avance de prospectos por el embudo (contactable→calificado→interesado→inscrito), tendencia.

SECCIÓN 2 - FORTALEZAS DE VENTA: qué hizo bien ${botName} para calificar, generar interés y avanzar prospectos.

SECCIÓN 3 - DÓNDE PERDIÓ PROSPECTOS: momentos donde el prospecto se enfrió, dudas no resueltas, calificaciones mal hechas, cierres débiles.

SECCIÓN 4 - OBJECIONES Y TEMAS FRECUENTES: top dudas/objeciones de los prospectos (precio, requisitos, modalidad, etc.).

SECCIÓN 5 - RECOMENDACIONES PARA EL PROMPT (COMPORTAMIENTO de venta): cambios al prompt para mejorar la calificación, persuasión y cierre. Texto exacto sugerido. NO incluyas aquí datos comerciales faltantes — eso va en la sección 6.

SECCIÓN 6 - VACÍOS DE CONOCIMIENTO COMERCIAL: info de programas/costos/beneficios que los prospectos pidieron y ${botName} no supo responder. Sugiere qué artículos agregar a la base de conocimientos.

SECCIÓN 7 - SCORE DE EFECTIVIDAD COMERCIAL (1 al 10) con justificación breve.`
    : `Eres un supervisor experto en calidad de atención al cliente para una universidad. Analiza las conversaciones del chatbot ${botName} de Blackwell Global University (BGU) del día ${dateStr} y genera un reporte estructurado.

PROMPT ACTUAL DE ${botName.toUpperCase()}:
---
${currentPrompt.slice(0, 3000)}
---

BASE DE CONOCIMIENTOS ACTUAL (temas que ${botName} ya tiene documentados):
---
${kbInventory}
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
Lista numerada de lo que ${botName} hizo correctamente.

SECCIÓN 3 - DEBILIDADES Y FALLOS:
Lista numerada de errores, confusiones o respuestas inadecuadas detectadas.

SECCIÓN 4 - TEMAS FRECUENTES:
Top 5 temas más consultados con frecuencia estimada.

SECCIÓN 5 - RECOMENDACIONES PARA EL PROMPT (fallos de COMPORTAMIENTO):
Cambios al prompt para corregir cómo se COMPORTA ${botName}: tono, reglas, cuándo proponer un ticket, cómo estructurar respuestas. Incluye el texto exacto sugerido para cada cambio. NO incluyas aquí datos que le falten — eso va en la sección 6.

SECCIÓN 6 - VACÍOS DE CONOCIMIENTO (fallos por FALTA DE INFORMACIÓN):
Casos donde ${botName} falló porque NO TENÍA el dato. Compara las preguntas del día contra la BASE DE CONOCIMIENTOS ACTUAL listada arriba. Lista los temas concretos que los usuarios preguntaron y que no supo responder, y que deberían agregarse como artículos. Para cada uno sugiere un título de artículo y qué debería contener.

SECCIÓN 7 - SCORE DE CALIDAD:
Puntuación del 1 al 10 con justificación breve.`

  const jsonInstruction = `

Responde SOLO con un JSON válido con esta estructura exacta:
{
  "executive_summary": "texto",
  "strengths": "texto",
  "weaknesses": "texto",
  "frequent_topics": "texto",
  "recommendations": "texto",
  "knowledge_gaps": "texto",
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
    knowledge_gaps: string
    quality_score: number
    quality_justification: string
  }

  try {
    // Streaming: evita que la conexión se corte por timeout en respuestas largas.
    const stream = client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{ role: 'user', content: analysisPrompt + jsonInstruction }],
    })
    const message = await stream.finalMessage()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = message.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    result = JSON.parse(jsonMatch[0])
  } catch (err) {
    await db.from('sofia_supervisor_reports').update({
      status: 'failed',
      generated_at: new Date().toISOString(),
    }).eq('report_date', dateStr).eq('bot_key', botKey)
    return { status: 500, body: { error: String(err) } }
  }

  // La IA a veces devuelve arreglos/objetos donde esperamos texto; forzamos a
  // string para no romper el UPDATE contra columnas text (fallaba en silencio).
  const asText = (v: unknown): string => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2))
  result.executive_summary = asText(result.executive_summary)
  result.strengths = asText(result.strengths)
  result.weaknesses = asText(result.weaknesses)
  result.frequent_topics = asText(result.frequent_topics)
  result.recommendations = asText(result.recommendations)
  result.knowledge_gaps = asText(result.knowledge_gaps)
  result.quality_justification = asText(result.quality_justification)
  const qScore = Number(result.quality_score)
  result.quality_score = Number.isFinite(qScore) ? qScore : 0

  const fullReport = `REPORTE SUPERVISOR ${botName.toUpperCase()} - ${dateStr}
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

RECOMENDACIONES PARA EL PROMPT (comportamiento)
------------------------------------------------
${result.recommendations}

VACÍOS DE CONOCIMIENTO (agregar a la base de conocimientos)
-----------------------------------------------------------
${result.knowledge_gaps ?? 'No se detectaron vacíos de conocimiento.'}

JUSTIFICACIÓN DEL SCORE
------------------------
${result.quality_justification}

Generado: ${new Date().toLocaleString('es-PE')}
`

  const { error: updErr } = await db.from('sofia_supervisor_reports').update({
    status: 'completed',
    executive_summary: result.executive_summary,
    strengths: result.strengths,
    weaknesses: result.weaknesses,
    recommendations: result.recommendations,
    knowledge_gaps: result.knowledge_gaps || null,
    prompt_suggestions: result.frequent_topics,
    full_report: fullReport,
    quality_score: result.quality_score,
    generated_at: new Date().toISOString(),
  }).eq('report_date', dateStr).eq('bot_key', botKey)

  if (updErr) {
    await db.from('sofia_supervisor_reports').update({ status: 'failed', generated_at: new Date().toISOString() })
      .eq('report_date', dateStr).eq('bot_key', botKey)
    return { status: 500, body: { error: 'Error al guardar el reporte: ' + updErr.message } }
  }

  return { status: 200, body: { ok: true, conversations: convList.length, score: result.quality_score } }
}
