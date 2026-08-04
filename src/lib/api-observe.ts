import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Registro de quién llama a las rutas que todavía no se pueden cerrar.
//
// Doce rutas no tienen llamador conocido dentro del repo: o las usa una
// integración externa —Flywire, Zoho, N8N— o son código muerto. Cerrarlas a
// ciegas rompería un cobro o una respuesta de ticket, y el síntoma aparecería
// lejos del cambio.
//
// Así que en vez de adivinar, se anota quién entra. En una semana los datos
// dicen cuáles tienen cliente real y cuáles no ha tocado nadie.
//
// Nunca lanza: un fallo del registro no puede tumbar la ruta que observa.
// ---------------------------------------------------------------------------
export async function observar(req: NextRequest, ruta: string): Promise<void> {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const h = req.headers
    await sb.from('api_access_log').insert({
      ruta,
      metodo: req.method,
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      user_agent: h.get('user-agent')?.slice(0, 300) ?? null,
      referer: h.get('referer')?.slice(0, 300) ?? null,
      // Sin descifrar la sesión: basta saber si el llamador traía cookie de
      // Supabase. Un navegador con sesión la manda; un servidor externo no.
      con_cookie_sesion: /sb-[^=]*-auth-token/.test(h.get('cookie') ?? ''),
      con_authorization: !!h.get('authorization'),
    })
  } catch { /* observar nunca puede romper la ruta observada */ }
}
