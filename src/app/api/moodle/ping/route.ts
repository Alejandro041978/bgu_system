import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { moodleConfigured, getSiteInfo } from '@/lib/moodle'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

// GET            → prueba de conexión con Moodle (core_webservice_get_site_info).
// GET ?buscar=x  → además, los NOMBRES de las funciones habilitadas que
//                  contengan "x". Sirve para saber qué se puede pedir sin
//                  suponerlo: la pregunta "¿podemos leer los coeficientes sin
//                  N8N?" se responde mirando si existe la función, no de
//                  memoria. Solo lee.
export async function GET(req: Request) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!moodleConfigured()) {
    return NextResponse.json({ ok: false, error: 'Faltan variables MOODLE_URL / MOODLE_WS_TOKEN en Vercel' }, { status: 400 })
  }
  try {
    const info = await getSiteInfo()
    const buscar = (new URL(req.url).searchParams.get('buscar') ?? '').trim().toLowerCase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todas: any[] = Array.isArray(info?.functions) ? info.functions : []
    return NextResponse.json({
      ok: true,
      sitename: info?.sitename ?? null,
      release: info?.release ?? null,
      username: info?.username ?? null,
      functions: todas.length,
      ...(buscar ? {
        buscar,
        coinciden: todas
          .map(f => String(f?.name ?? ''))
          .filter(n => n.toLowerCase().includes(buscar))
          .sort(),
      } : {}),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error desconocido' }, { status: 502 })
  }
}
