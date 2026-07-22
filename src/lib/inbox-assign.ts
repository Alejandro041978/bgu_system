import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface Assignment { user_id: string; name: string }

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
): Promise<Assignment | null> {
  try {
    const sb = db()
    const { data: agents } = await sb.from('agent_skills')
      .select('user_id, agent_name, languages, topics, categories, last_assigned_at, is_supervisor')
      .eq('online', true)

    type Row = { user_id: string; agent_name: string | null; languages: string[]; topics: string[]; categories: string[] | null; last_assigned_at: string | null; is_supervisor: boolean }
    const rows = (agents ?? []) as Row[]
    const agentes = rows.filter(a => !a.is_supervisor)

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
