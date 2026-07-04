import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/sofia/debug-bots — muestra el estado real de la tabla bots
export async function GET() {
  const { data, error } = await db()
    .from('bots')
    .select('key, name, role, prompt, updated_at')
    .order('key')

  if (error) return NextResponse.json({ error: error.message })

  return NextResponse.json({
    bots: (data ?? []).map((b: { key: string; name: string; role: string | null; prompt: string; updated_at: string }) => ({
      key: b.key,
      name: b.name,
      role: b.role,
      prompt_length: (b.prompt ?? '').length,
      prompt_preview: (b.prompt ?? '').slice(0, 120),
      updated_at: b.updated_at,
    })),
  })
}
