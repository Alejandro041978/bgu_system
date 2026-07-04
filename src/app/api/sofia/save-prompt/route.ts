import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceRole } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { prompt, bot } = await req.json() as { prompt?: string; bot?: string }
    if (!prompt || prompt.trim().length < 10) {
      return NextResponse.json({ error: 'Prompt demasiado corto' }, { status: 400 })
    }
    const botKey = bot ?? 'sofia'

    // Verificar autenticación con cliente normal (lee cookie del usuario)
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Escribir con service role REAL (bypasa RLS). El helper SSR usa la cookie
    // del usuario y NO bypasa RLS, por eso fallaba en la tabla bots.
    const service = createServiceRole(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = service as any

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
