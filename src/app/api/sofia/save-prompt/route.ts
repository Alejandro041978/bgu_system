import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { prompt, bot } = await req.json() as { prompt?: string; bot?: string }
    if (!prompt || prompt.trim().length < 10) {
      return NextResponse.json({ error: 'Prompt demasiado corto' }, { status: 400 })
    }
    const botKey = bot ?? 'sofia'

    // Verificar autenticación con cliente normal
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Usar service client para escribir en tabla con RLS
    const supabase = await createServiceClient()
    const { error } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('bots')
      .update({ prompt: prompt.trim(), updated_at: new Date().toISOString() })
      .eq('key', botKey)

    // Mantener ai_master_prompt sincronizado para Sofia (compatibilidad con "Regenerar con IA")
    if (botKey === 'sofia') {
      await (supabase as any)
        .from('ai_master_prompt')
        .update({ prompt: prompt.trim(), updated_at: new Date().toISOString() })
        .eq('id', 1)
    }

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
