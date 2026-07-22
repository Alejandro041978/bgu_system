import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Desempate por ESPECIALIDAD: cuando varias asesoras cubren la categoría y el
// tema no distingue, Claude compara el CONTENIDO del mensaje contra la
// especialidad (texto libre) de cada candidata. Devuelve el user_id elegido o
// null (→ round-robin). Solo se invoca con 2+ candidatas con especialidad.
async function pickBySpecialty(
  content: string,
  candidates: { user_id: string; agent_name: string | null; specialty?: string | null }[],
): Promise<string | null> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return null
    const conEsp = candidates.filter(c => c.specialty?.trim())
    if (conEsp.length < 2) return null
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const lista = conEsp.map((c, i) => `${i + 1}. ${c.agent_name ?? c.user_id}: ${c.specialty}`).join('\n')
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 50,
      system: `Eres el enrutador de un helpdesk universitario. Según el mensaje del estudiante y la especialidad de cada asesora, elige la más indicada. Responde SOLO el número de la asesora (ej. "2"). Si ninguna especialidad calza claramente mejor, responde "0".`,
      messages: [{ role: 'user', content: `Mensaje del estudiante:\n${content.slice(0, 2000)}\n\nAsesoras:\n${lista}` }],
    })
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const n = Number(text.match(/\d+/)?.[0] ?? 0)
    if (n >= 1 && n <= conEsp.length) return conEsp[n - 1].user_id
    return null
  } catch { return null }
}

export interface Assignment { user_id: string; name: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Saludo DIRIGIDO: "Hola Sara", "Buenas tardes Srta Claudia" — el estudiante
// ya eligió a su asesora. Se busca el primer nombre de cada integrante en
// línea dentro de la ZONA DE SALUDO (primeros 250 caracteres, para no pescar
// menciones de pasada más abajo). Solo aplica si UNA sola persona calza; con
// ambigüedad (dos nombres, o dos asesoras que se llaman igual) se ignora la
// señal y decide el resto del motor.
function addressedAgent<T extends { user_id: string; agent_name: string | null }>(
  content: string, agents: T[],
): T | null {
  const zone = norm(content.slice(0, 250))
  const matched = new Map<string, T>()
  const firstNames = new Map<string, number>()
  for (const a of agents) {
    const first = norm((a.agent_name ?? '').trim().split(/\s+/)[0] ?? '')
    if (first.length < 3) continue
    firstNames.set(first, (firstNames.get(first) ?? 0) + 1)
    if (new RegExp(`(^|[^a-z])${first}([^a-z]|$)`).test(zone)) matched.set(a.user_id, a)
  }
  if (matched.size !== 1) return null
  const hit = [...matched.values()][0]
  const first = norm((hit.agent_name ?? '').trim().split(/\s+/)[0] ?? '')
  // Dos asesoras con el mismo primer nombre = ambiguo aunque solo una esté en el Map
  if ((firstNames.get(first) ?? 0) > 1) return null
  return hit
}

export interface IdentifiedStudent {
  id: string
  name: string
  categories: string[]   // nombres de categorías de sus programas (matchean agent_skills.categories)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withCategories(sb: any, stu: any): Promise<IdentifiedStudent | null> {
  if (!stu) return null
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('academic_programs(category:academic_programs_category(name))').eq('student_id', stu.id)
  const categories = [...new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((enr ?? []) as any[]).map(e => e.academic_programs?.category?.name).filter(Boolean)
  )] as string[]
  return {
    id: stu.id,
    name: [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' '),
    categories,
  }
}

/** Identifica al estudiante por el correo remitente (personal o institucional). */
export async function identifyStudentByEmail(email: string | null): Promise<IdentifiedStudent | null> {
  if (!email) return null
  try {
    const sb = db()
    const mail = email.trim().toLowerCase()
    const { data: stu } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name')
      .or(`email.eq.${mail},email_alt.eq.${mail}`).limit(1).maybeSingle()
    return withCategories(sb, stu)
  } catch { return null }
}

/** Identifica por documento (handoff de Sofía) o por teléfono (últimos 9 dígitos). */
export async function identifyStudentByDocOrPhone(document: string | null, phone: string | null): Promise<IdentifiedStudent | null> {
  try {
    const sb = db()
    if (document?.trim()) {
      const { data: stu } = await sb.from('academic_students')
        .select('id, first_name, last_name, second_last_name')
        .eq('document_number', document.trim()).limit(1).maybeSingle()
      const r = await withCategories(sb, stu)
      if (r) return r
    }
    const digits = (phone ?? '').replace(/\D/g, '')
    if (digits.length >= 8) {
      const { data: stu } = await sb.from('academic_students')
        .select('id, first_name, last_name, second_last_name')
        .ilike('phone_number', `%${digits.slice(-9)}`).limit(1).maybeSingle()
      return withCategories(sb, stu)
    }
    return null
  } catch { return null }
}

/**
 * Elige la agente para una conversación (regla del usuario, 2026-07-22):
 *  0. SALUDO DIRIGIDO ("Hola Sara") → esa persona, si está en línea y el
 *     nombre es inequívoco.
 *  1. Si el ESTUDIANTE está identificado → asesoras cuyas CATEGORÍAS de
 *     programa cubren las del estudiante (y su idioma, si se conoce):
 *       - una sola calificada → directa;
 *       - varias → desempata el CONTENIDO (tema clasificado); si el tema no
 *         desempata, round-robin dentro del grupo.
 *  2. Sin identificación (o sin asesora de esa categoría) → idioma + tema
 *     explícitos (comportamiento clásico; skill vacío = no recibe).
 *  3. Nadie califica → SUPERVISORA en línea (triage manual).
 *  Round-robin siempre: la que hace más tiempo no recibe.
 */
export async function autoAssign(
  language: string | null,
  topic: string | null,
  studentCategories?: string[] | null,
  content?: string | null,
): Promise<Assignment | null> {
  try {
    const sb = db()
    // select('*') a propósito: pedir una columna que aún no existe (migración
    // sin correr) hacía fallar TODO el motor en silencio y nada se asignaba.
    const { data: agents, error: agErr } = await sb.from('agent_skills')
      .select('*').eq('online', true)
    if (agErr) console.error('autoAssign agent_skills:', agErr.message)

    type Row = { user_id: string; agent_name: string | null; languages: string[]; topics: string[]; categories: string[] | null; specialty?: string | null; last_assigned_at: string | null; is_supervisor: boolean }
    const rows = (agents ?? []) as Row[]
    const agentes = rows.filter(a => !a.is_supervisor)

    // 0) Saludo dirigido — la señal más explícita: si el mensaje nombra a UNA
    // integrante en línea del equipo en el saludo, va con ella directamente
    // (incluye a la supervisora: el estudiante la pidió por nombre).
    if (content?.trim()) {
      const directa = addressedAgent(content, rows)
      if (directa) {
        await sb.from('agent_skills').update({ last_assigned_at: new Date().toISOString() }).eq('user_id', directa.user_id)
        return { user_id: directa.user_id, name: directa.agent_name ?? 'Agente' }
      }
    }

    let pool: Row[] = []

    // 1) Por categoría del estudiante (con idioma si se conoce)
    if (studentCategories?.length) {
      const catPool = agentes.filter(a =>
        (a.categories ?? []).some(c => studentCategories.includes(c)) &&
        (!language || a.languages.includes(language))
      )
      if (catPool.length === 1) pool = catPool
      else if (catPool.length > 1) {
        const byTopic = catPool.filter(a => !!topic && a.topics.includes(topic))
        pool = byTopic.length ? byTopic : catPool
        // Si sigue habiendo varias, la ESPECIALIDAD (texto libre) desempata
        // leyendo el contenido del mensaje
        if (pool.length > 1 && content?.trim()) {
          const picked = await pickBySpecialty(content, pool)
          if (picked) pool = pool.filter(a => a.user_id === picked)
        }
      }
    }

    // 2) Clásico: idioma + tema explícitos
    if (pool.length === 0) {
      pool = agentes.filter(a =>
        !!language && a.languages.includes(language) &&
        !!topic && a.topics.includes(topic)
      )
    }

    // 3) Catch-all: supervisoras en línea
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
