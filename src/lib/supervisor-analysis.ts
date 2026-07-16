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

  // Fetch conversations from target date (de este bot).
  // select('*') a propósito: ref_label sólo existe para las conversaciones del
  // buzón (inbox), no para las de los bots. Pedirla explícita hacía fallar toda
  // la consulta ("column ... does not exist"); con '*' se tolera su ausencia y
  // el acceso posterior ya usa `c.ref_label ?? fallback`.
  const { data: conversations, error } = await db
    .from('sofia_conversations')
    .select('*')
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
  const convSamples = convList.slice(0, 50).map((c: { messages?: { role: string; content: string }[]; source?: string; created_at: string; ref_label?: string | null }, i: number) => {
    const msgs = c.messages ?? []
    const preview = msgs
      .filter(m => m.content)
      .map(m => `  [${m.role === 'user' ? 'Usuario' : botName}]: ${m.content.slice(0, 400)}`)
      .join('\n')
    const label = c.ref_label ?? `Conversación ${i + 1}`
    return `--- ${label} (${c.source ?? 'web'}, ${new Date(c.created_at).toLocaleTimeString('es-PE')}) ---\n${preview}`
  }).join('\n\n')

  // Desglose por canal
  const sourceMap: Record<string, number> = {}
  for (const c of convList) {
    const s = c.source ?? 'web'
    sourceMap[s] = (sourceMap[s] ?? 0) + 1
  }

  const isSales = botRole === 'ventas'
  const isInbox = botRole === 'inbox'
  const isRetention = botRole === 'retencion'

  // Camila es el único bot cuyo trabajo se puede contrastar con la realidad:
  // prometió que volvería el día X, y el aula dice si volvió. Sin esto, el
  // supervisor sólo opinaría sobre si suena simpática.
  let retentionStats = ''
  if (isRetention) {
    const { data: tr } = await db.from('student_tracking')
      .select('last_outcome, last_outcome_at, commitment_date, commitment_kept, do_not_contact, contact_attempts')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (tr ?? []) as any[]
    const hoy = rows.filter(r => r.last_outcome_at && String(r.last_outcome_at).slice(0, 10) === dateStr)
    const cuenta = (arr: typeof rows) => arr.reduce((a: Record<string, number>, r) => {
      const k = r.last_outcome ?? '(sin clasificar)'; a[k] = (a[k] ?? 0) + 1; return a
    }, {})
    const verificados = rows.filter(r => r.commitment_kept !== null)
    const cumplidos = verificados.filter(r => r.commitment_kept === true).length
    const objeciones = cuenta(rows.filter(r => String(r.last_outcome ?? '').startsWith('objecion_')))

    retentionStats = `
RESULTADOS DE HOY (${dateStr}) — clasificación que la propia ${botName} asignó:
${Object.entries(cuenta(hoy)).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (sin diálogos clasificados hoy)'}

PROMESAS CONTRA REALIDAD (acumulado, verificado contra la última conexión al aula):
- Compromisos ya vencidos y verificados: ${verificados.length}
- Cumplieron (volvieron al aula): ${cumplidos}
- Incumplieron: ${verificados.length - cumplidos}
${verificados.length ? `- Tasa real de cumplimiento: ${Math.round(cumplidos / verificados.length * 100)}%` : ''}

TRABAS DETECTADAS (acumulado):
${Object.entries(objeciones).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (ninguna todavía)'}

Estudiantes que pidieron no ser contactados: ${rows.filter(r => r.do_not_contact).length}
`
  }

  const analysisPrompt = isRetention
    ? `Eres el supervisor de ${botName}, el bot de RETENCIÓN de Blackwell Global University (BGU). Analiza sus conversaciones del ${dateStr}.

${botName} no atiende consultas: busca a estudiantes que dejaron de entrar al aula y trabaja para que retomen. En las conversaciones "Usuario" es el estudiante y "${botName}" es el bot.

SU ÉXITO NO ES QUE LE DIGAN QUE SÍ. Es que el estudiante VUELVA AL AULA. Un "sí, ya voy a entrar" dicho para que deje de escribir no vale nada. Evalúala contra eso, no contra si sonó amable.

ESTADÍSTICAS DEL DÍA:
- Conversaciones: ${convList.length}
- Mensajes: ${totalMessages}
- Canales: ${Object.entries(sourceMap).map(([s, n]) => `${s}(${n})`).join(', ')}
${retentionStats}
SU BASE DE CONOCIMIENTOS ACTUAL:
${kbInventory}

MUESTRA DE CONVERSACIONES (${Math.min(convList.length, 50)} de ${convList.length}):
${convSamples}

Entrega el análisis en estas secciones:

SECCIÓN 1 - RESUMEN EJECUTIVO:
Qué pasó hoy y, sobre todo, si está reteniendo de verdad. Contrasta los compromisos que consiguió con los que se cumplieron. Si la tasa real de cumplimiento es baja, dilo sin rodeos: significa que está consiguiendo promesas de cortesía, no retención.

SECCIÓN 2 - FORTALEZAS:
Qué hizo bien. Prioriza los casos donde encontró la traba real y la desarmó, no donde fue simpática.

SECCIÓN 3 - DEBILIDADES Y FALLOS:
Errores concretos. Revisa especialmente estos guardarraíles, que son los que más daño hacen si falla:
a) ¿ADVIRTIÓ ANTES DE PREGUNTAR? Nunca debe asumir el motivo de la ausencia; su primer mensaje abre preguntando.
b) ¿INSISTIÓ EN UN CASO DE SALUD, DUELO O PROBLEMA GRAVE? Ahí debe detenerse, no presionar.
c) ¿SIGUIÓ ESCRIBIENDO DESPUÉS DE UN "NO" o de que anunciaran su retiro? Debe soltar y pasarlo a la llamada humana.
d) ¿USÓ LA DEUDA COMO AMENAZA? Puede hablar de dinero, pero como obstáculo a quitar, nunca como presión.
e) ¿PROMETIÓ ALGO QUE NO ESTÁ EN SU BASE? (condonaciones, becas, plazos). Especial atención al LOA: debe decir SIEMPRE que obliga a volver al inicio del próximo semestre y que si no vuelve pierde su beca. Presentarlo como una pausa sin costo es un daño real al estudiante.
f) ¿SE CONFORMÓ CON UNA INTENCIÓN SIN FECHA? Todo compromiso va con fecha concreta.

SECCIÓN 4 - TEMAS FRECUENTES:
Las trabas que aparecieron y con qué frecuencia. Esto es la CAUSA DE DESERCIÓN: es el dato más valioso que produce ${botName}. Di qué está empujando a la gente a irse.

SECCIÓN 5 - RECOMENDACIONES PARA EL PROMPT (fallos de COMPORTAMIENTO):
Cambios al prompt para que retenga mejor: cómo abrir, cómo insistir sin quemar, cómo pedir la fecha, cuándo soltar. Texto exacto sugerido. NO incluyas aquí datos que le falten — eso va en la sección 6.

SECCIÓN 6 - VACÍOS DE CONOCIMIENTO (fallos por FALTA DE INFORMACIÓN):
Casos donde falló porque NO TENÍA el dato. Compara lo que preguntaron contra su BASE actual. Para cada vacío sugiere título del artículo y qué debe contener.

SECCIÓN 7 - SCORE DE CALIDAD:
Del 1 al 10. Pondera la RECONEXIÓN REAL por encima de todo; después el respeto a los guardarraíles; y sólo al final el tono. Un bot encantador que no logra que nadie vuelva no aprueba.`
    : isInbox
    ? `Eres un supervisor de calidad del equipo HUMANO de Servicio al Estudiante de Blackwell Global University (BGU). Analiza las conversaciones atendidas por AGENTES HUMANOS (canal WhatsApp y correo) del día ${dateStr} y evalúa la calidad de la atención.

En las conversaciones, "Usuario" es el estudiante/cliente y "${botName}" representa las respuestas del AGENTE HUMANO del equipo.
Cada conversación tiene un número de caso (ej. "Caso #123"); CÍTALO cuando menciones un caso específico en fortalezas, fallos o recomendaciones.

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

Además de las secciones en prosa, entrega una lista de MEJORAS CONCRETAS Y APLICABLES en el campo "suggestions". Cada una es un cambio atómico que un humano aprueba y se aplica solo. Reglas:
- Máximo 4 mejoras por día, las de mayor impacto. Prefiere pocas y buenas: no inundes.
- Cada mejora es autosuficiente y lista para incorporarse tal cual, sin editar.
- type "prompt": un ajuste de COMPORTAMIENTO. "content" es el texto EXACTO que se agregará al prompt de ${botName}, redactado como instrucción directa al bot (ej: "Cuando el estudiante pida X, haz Y").
- type "knowledge": un dato que le FALTÓ. "content" es la respuesta correcta; "kb_question" la pregunta que responde; "kb_topic" una categoría corta; "kb_tags" palabras clave separadas por coma.
- "title" es el problema detectado en una frase; "recommendation" es qué hace la mejora, en una línea.
- Sólo propón una mejora si de verdad se justifica con lo que viste hoy. Si el bot anduvo bien, devuelve "suggestions": [].

Responde SOLO con un JSON válido con esta estructura exacta:
{
  "executive_summary": "texto",
  "strengths": "texto",
  "weaknesses": "texto",
  "frequent_topics": "texto",
  "recommendations": "texto",
  "knowledge_gaps": "texto",
  "quality_score": 8,
  "quality_justification": "texto",
  "suggestions": [
    { "type": "prompt", "title": "...", "recommendation": "...", "content": "..." },
    { "type": "knowledge", "title": "...", "recommendation": "...", "content": "...", "kb_question": "...", "kb_topic": "...", "kb_tags": "..." }
  ]
}`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = null
  let rawText = ''

  try {
    // Streaming: evita que la conexión se corte por timeout en respuestas largas.
    const stream = client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      messages: [{ role: 'user', content: analysisPrompt + jsonInstruction }],
    })
    const message = await stream.finalMessage()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawText = message.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    let jsonStr = rawText.trim()
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i) // quita cercos ```json ... ```
    if (fence) jsonStr = fence[1]
    const m = jsonStr.match(/\{[\s\S]*\}/)
    if (m) result = JSON.parse(m[0])
  } catch {
    result = null
  }

  // Fallback: si no se pudo estructurar el JSON pero hay texto, lo guardamos igual
  // (el usuario ve el análisis) en vez de dejar el reporte fallido/pendiente.
  if (!result) {
    if (!rawText.trim()) {
      await db.from('sofia_supervisor_reports').update({ status: 'failed', generated_at: new Date().toISOString() })
        .eq('report_date', dateStr).eq('bot_key', botKey)
      return { status: 500, body: { error: 'La IA no devolvió contenido.' } }
    }
    await db.from('sofia_supervisor_reports').update({
      status: 'completed',
      executive_summary: rawText.slice(0, 3000),
      full_report: rawText,
      quality_score: null,
      generated_at: new Date().toISOString(),
    }).eq('report_date', dateStr).eq('bot_key', botKey)
    return { status: 200, body: { ok: true, conversations: convList.length, fallback: true } }
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

  const payload: Record<string, unknown> = {
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
  }
  let { error: updErr } = await db.from('sofia_supervisor_reports').update(payload)
    .eq('report_date', dateStr).eq('bot_key', botKey)

  // Resiliencia: si la columna knowledge_gaps aún no existe, guarda sin ella
  // (el contenido igual queda dentro de full_report).
  if (updErr && /knowledge_gaps/i.test(updErr.message)) {
    delete payload.knowledge_gaps
    ;({ error: updErr } = await db.from('sofia_supervisor_reports').update(payload)
      .eq('report_date', dateStr).eq('bot_key', botKey))
  }

  if (updErr) {
    await db.from('sofia_supervisor_reports').update({ status: 'failed', generated_at: new Date().toISOString() })
      .eq('report_date', dateStr).eq('bot_key', botKey)
    return { status: 500, body: { error: 'Error al guardar el reporte: ' + updErr.message } }
  }

  // Guardar las mejoras atómicas como sugerencias pendientes de revisión. El
  // upsert por (bot_key, type, title) evita que la misma mejora se repita día
  // tras día. Tolerante a que la tabla no exista todavía.
  //
  // Sólo para BOTS: el buzón humano (isInbox) no tiene prompt ni base que
  // mejorar, así que sus sugerencias no aplican.
  let suggestionsSaved = 0
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions : []
  if (!isInbox && suggestions.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = suggestions.filter((x: any) => x && (x.type === 'prompt' || x.type === 'knowledge') && x.title && x.content)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .slice(0, 4).map((x: any) => ({
        bot_key: botKey, report_date: dateStr, type: x.type,
        title: asText(x.title).slice(0, 300), recommendation: asText(x.recommendation).slice(0, 500),
        content: asText(x.content),
        kb_topic: x.kb_topic ? asText(x.kb_topic).slice(0, 120) : null,
        kb_question: x.kb_question ? asText(x.kb_question).slice(0, 300) : null,
        kb_tags: x.kb_tags ? asText(x.kb_tags).slice(0, 300) : null,
      }))
    if (rows.length) {
      // ignoreDuplicates: si ya se propuso esa mejora (mismo title) y sigue
      // pendiente o fue resuelta, no la volvemos a crear.
      const { error: sErr } = await db.from('supervisor_suggestions')
        .upsert(rows, { onConflict: 'bot_key,type,title', ignoreDuplicates: true })
      if (!sErr) suggestionsSaved = rows.length
    }
  }

  return { status: 200, body: { ok: true, conversations: convList.length, score: result.quality_score, suggestions: suggestionsSaved } }
}
