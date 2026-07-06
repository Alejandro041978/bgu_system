import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface Assignment { user_id: string; name: string }

/**
 * Elige la agente para una conversación por idioma + tema (round-robin).
 * Reglas:
 *  - Solo agentes en línea (online) y no supervisoras.
 *  - Calificada = (languages vacío O incluye el idioma) Y (topics vacío O incluye el tema).
 *  - Round-robin: la que hace más tiempo no recibe (last_assigned_at más antiguo; nunca asignada primero).
 * Devuelve null si no hay agente calificada → la conversación queda en cola para la SUPERVISORA (triage).
 */
export async function autoAssign(language: string | null, topic: string | null): Promise<Assignment | null> {
  try {
    const sb = db()
    const { data: agents } = await sb.from('agent_skills')
      .select('user_id, agent_name, languages, topics, last_assigned_at')
      .eq('online', true).eq('is_supervisor', false)

    const qualified = (agents ?? []).filter((a: { languages: string[]; topics: string[] }) =>
      (a.languages.length === 0 || (language ? a.languages.includes(language) : true)) &&
      (a.topics.length === 0 || (topic ? a.topics.includes(topic) : true))
    )
    if (qualified.length === 0) return null

    // Round-robin: menos recientemente asignada (null = nunca → prioridad máxima)
    qualified.sort((a: { last_assigned_at: string | null }, b: { last_assigned_at: string | null }) =>
      (a.last_assigned_at ?? '').localeCompare(b.last_assigned_at ?? ''))
    const chosen = qualified[0]

    await sb.from('agent_skills').update({ last_assigned_at: new Date().toISOString() }).eq('user_id', chosen.user_id)
    return { user_id: chosen.user_id, name: chosen.agent_name ?? 'Agente' }
  } catch (err) {
    console.error('autoAssign error:', err)
    return null
  }
}
