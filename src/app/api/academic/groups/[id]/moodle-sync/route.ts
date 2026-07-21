import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { syncGroup } from '@/lib/moodle-provision'

export const revalidate = 0
export const maxDuration = 300

// POST → re-aprovisiona (matricula) los miembros activos del grupo en sus aulas Moodle.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const result = await syncGroup(id)
  return NextResponse.json(result)
}
