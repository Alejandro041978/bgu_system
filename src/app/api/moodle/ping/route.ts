import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { moodleConfigured, getSiteInfo } from '@/lib/moodle'

export const revalidate = 0

// GET → prueba de conexión con Moodle (core_webservice_get_site_info). Requiere sesión.
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!moodleConfigured()) {
    return NextResponse.json({ ok: false, error: 'Faltan variables MOODLE_URL / MOODLE_WS_TOKEN en Vercel' }, { status: 400 })
  }
  try {
    const info = await getSiteInfo()
    return NextResponse.json({
      ok: true,
      sitename: info?.sitename ?? null,
      release: info?.release ?? null,
      username: info?.username ?? null,
      functions: Array.isArray(info?.functions) ? info.functions.length : null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error desconocido' }, { status: 502 })
  }
}
