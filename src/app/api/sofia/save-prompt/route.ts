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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any

    // Upsert por si la fila del bot no existiera aún
    const { data, error } = await sb
      .from('bots')
      .upsert(
        { key: botKey, name: botKey.charAt(0).toUpperCase() + botKey.slice(1), prompt: prompt.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      .select('key')

    // Mantener ai_master_prompt sincronizado para Sofia (compatibilidad con "Regenerar con IA")
    if (botKey === 'sofia') {
      await sb
        .from('ai_master_prompt')
        .update({ prompt: prompt.trim(), updated_at: new Date().toISOString() })
        .eq('id', 1)
    }

    if (error) throw error

    return NextResponse.json({ ok: true, updated: data?.length ?? 0 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
