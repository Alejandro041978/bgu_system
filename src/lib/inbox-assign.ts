import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface Assignment { user_id: string; name: string }

/**
 * Elige la agente para una conversación por idioma + tema (round-robin).
 * Reglas:
 *  - Solo agentes en línea (online).
 *  - Calificada = agente NO supervisora con el idioma marcado EXPLÍCITAMENTE Y el tema marcado EXPLÍCITAMENTE.
 *    (skill vacío = NO recibe; el agente solo atiende lo que configuró.)
 *  - Si NINGÚN agente califica → cae en la SUPERVISORA (catch-all): se auto-asigna a la supervisora
 *    en línea para que la revise y la derive manualmente.
 *  - Round-robin: la que hace más tiempo no recibe (last_assigned_at más antiguo; nunca asignada primero).
 * Devuelve null solo si no hay agente calificada NI supervisora en línea → queda sin asignar en la Cola.
 */
export async function autoAssign(language: string | null, topic: string | null): Promise<Assignment | null> {
  try {
    const sb = db()
    const { data: agents } = await sb.from('agent_skills')
      .select('user_id, agent_name, languages, topics, last_assigned_at, is_supervisor')
      .eq('online', true)

    type Row = { user_id: string; agent_name: string | null; languages: string[]; topics: string[]; last_assigned_at: string | null; is_supervisor: boolean }
    const rows = (agents ?? []) as Row[]

    // 1) Agentes calificadas (no supervisoras, con idioma+tema explícitos)
    let pool = rows.filter(a =>
      !a.is_supervisor &&
      !!language && a.languages.includes(language) &&
      !!topic && a.topics.includes(topic)
    )
    // 2) Fallback catch-all: supervisoras en línea (triage manual)
    if (pool.length === 0) pool = rows.filter(a => a.is_supervisor)
    if (pool.length === 0) return null

    // Round-robin: menos recientemente asignada (null = nunca → prioridad máxima)
    pool.sort((a, b) => (a.last_assigned_at ?? '').localeCompare(b.last_assigned_at ?? ''))
    const chosen = pool[0]

    await sb.from('agent_skills').update({ last_assigned_at: new Date().toISOString() }).eq('user_id', chosen.user_id)
    return { user_id: chosen.user_id, name: chosen.agent_name ?? 'Agente' }
  } catch (err) {
    console.error('autoAssign error:', err)
    return null
  }
}
