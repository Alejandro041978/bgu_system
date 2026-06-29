import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Prompt actual (editado manualmente o generado antes) — se usa como base
    const { data: current } = await supabase
      .from('ai_master_prompt')
      .select('prompt')
      .eq('id', 1)
      .single()

    const currentPrompt = current?.prompt ?? ''

    // Muestra representativa de tickets recientes
    const { data: tickets, count: ticketCount } = await supabase
      .from('desk_tickets')
      .select('subject, status_type, priority, department_name, channel, zoho_created_at', { count: 'exact' })
      .order('zoho_created_at', { ascending: false })
      .limit(800)

    // Conversaciones recientes con contenido
    const { data: conversations, count: convCount } = await supabase
      .from('desk_conversations')
      .select('content, author_type', { count: 'exact' })
      .not('content', 'is', null)
      .neq('content', '')
      .order('zoho_created_at', { ascending: false })
      .limit(300)

    if (!tickets || tickets.length === 0) {
      return NextResponse.json({ error: 'No tickets found' }, { status: 500 })
    }

    // Estadísticas por departamento y canal
    const deptMap: Record<string, number> = {}
    const channelMap: Record<string, number> = {}
    const statusMap: Record<string, number> = { open: 0, on_hold: 0, closed: 0 }

    for (const t of tickets) {
      const dept = t.department_name ?? 'Sin departamento'
      deptMap[dept] = (deptMap[dept] ?? 0) + 1
      const ch = t.channel ?? 'Sin canal'
      channelMap[ch] = (channelMap[ch] ?? 0) + 1
      if (t.status_type && statusMap[t.status_type] !== undefined) {
        statusMap[t.status_type]++
      }
    }

    const deptSummary = Object.entries(deptMap)
      .sort((a, b) => b[1] - a[1])
      .map(([d, n]) => `  - ${d}: ${n} tickets`)
      .join('\n')

    const sampleSubjects = tickets
      .slice(0, 200)
      .map(t => t.subject)
      .filter(Boolean)
      .join('\n')

    const sampleConvs = (conversations ?? [])
      .filter(c => c.content && c.content.length > 20)
      .slice(0, 100)
      .map(c => `[${c.author_type === 'agent' ? 'Agente' : 'Estudiante'}]: ${c.content!.slice(0, 300)}`)
      .join('\n---\n')

    const analysisPrompt = `Eres un experto en atención al cliente universitario. Tu tarea es MEJORAR Y ENRIQUECER el prompt maestro actual de Sofia, la asistente virtual de Blackwell Global University (BGU), usando los nuevos datos de tickets de soporte.

PROMPT MAESTRO ACTUAL (base — NO lo borres, mejóralo):
---
${currentPrompt}
---

NUEVOS DATOS DE TICKETS (últimos ${tickets.length} tickets analizados):

Distribución por departamento:
${deptSummary}

Canales: ${Object.entries(channelMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,n])=>`${c}(${n})`).join(', ')}
Estados: Abiertos ${statusMap.open}, En espera ${statusMap.on_hold}, Cerrados ${statusMap.closed}

Muestra de temas/sujetos recientes:
${sampleSubjects}

Muestra de conversaciones reales:
${sampleConvs}

---

INSTRUCCIONES:
1. Conserva TODO lo que ya está en el prompt actual — especialmente cualquier instrucción manual agregada por el administrador
2. Agrega o actualiza la sección de temas frecuentes basándote en los datos nuevos
3. Mejora las respuestas modelo si los datos muestran patrones nuevos
4. NO cambies la identidad ni el tono de Sofia
5. Entrega el prompt completo y mejorado (no solo los cambios)`

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      messages: [{ role: 'user', content: analysisPrompt }],
    })

    const newPrompt = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    // UPDATE — siempre la misma fila, nunca INSERT
    await supabase
      .from('ai_master_prompt')
      .update({
        prompt: newPrompt,
        ticket_count: ticketCount ?? tickets.length,
        conversation_count: convCount ?? (conversations?.length ?? 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)

    return NextResponse.json({
      ok: true,
      ticketCount,
      convCount,
      promptLength: newPrompt.length,
    })
  } catch (err) {
    console.error('build-prompt error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
