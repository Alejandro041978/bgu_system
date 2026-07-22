import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// GET → agentes del equipo helpdesk (is_helpdesk) con sus skills + categorías disponibles
export async function GET() {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()

  const { data: emps } = await sb.from('hr_employees')
    .select('id, full_name, position, user_id')
    .eq('is_helpdesk', true).not('user_id', 'is', null).order('full_name')

  const userIds = (emps ?? []).map((e: { user_id: string }) => e.user_id)
  const { data: skills } = userIds.length
    ? await sb.from('agent_skills').select('*').in('user_id', userIds)
    : { data: [] }
  const byUser: Record<string, unknown> = {}
  for (const s of skills ?? []) byUser[s.user_id] = s

  const agents = (emps ?? []).map((e: { id: string; full_name: string; position: string | null; user_id: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = byUser[e.user_id] as any
    return {
      user_id: e.user_id, full_name: e.full_name, position: e.position,
      languages: s?.languages ?? [], topics: s?.topics ?? [], categories: s?.categories ?? [],
      specialty: s?.specialty ?? null,
      is_supervisor: s?.is_supervisor ?? false, online: s?.online ?? true,
    }
  })

  const { data: categories } = await sb.from('academic_programs_category').select('id, name').order('name')

  return NextResponse.json({ agents, categories: categories ?? [] })
}

// PUT → guarda los skills de un agente
export async function PUT(req: NextRequest) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json() as {
    user_id: string; agent_name?: string
    languages?: string[]; topics?: string[]; categories?: string[]
    specialty?: string | null
    is_supervisor?: boolean; online?: boolean
  }
  if (!b.user_id) return NextResponse.json({ error: 'Falta user_id' }, { status: 400 })

  const { error } = await db().from('agent_skills').upsert({
    user_id: b.user_id, agent_name: b.agent_name ?? null,
    languages: b.languages ?? [], topics: b.topics ?? [], categories: b.categories ?? [],
    specialty: b.specialty?.trim() || null,
    is_supervisor: b.is_supervisor ?? false, online: b.online ?? true,
  }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
