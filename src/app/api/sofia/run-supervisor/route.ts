import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { analyzeSupervisor } from '@/lib/supervisor-analysis'

// El análisis de IA tarda ~1 min; sin esto la función se corta antes de terminar.
export const maxDuration = 300

// Endpoint para disparar el análisis del supervisor desde el panel (usuario
// autenticado). Ejecuta el análisis EN PROCESO (sin salto HTTP al cron), para
// no apilar dos timeouts de función.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const bot = req.nextUrl.searchParams.get('bot') ?? 'sofia'

  const r = await analyzeSupervisor(bot, date)
  return NextResponse.json(r.body, { status: r.status })
}
