import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

// Diagnóstico de la configuración Flywire (2026-07-23): muestra los valores
// EFECTIVOS de las variables públicas (env, recipient) que están corriendo en
// este build, y si los secretos existen — SIN revelarlos. Solo con sesión.
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rec = process.env.NEXT_PUBLIC_FLYWIRE_RECIPIENT ?? null
  return NextResponse.json({
    // Estos dos son públicos por diseño (NEXT_PUBLIC_): se inyectan en el bundle.
    env: process.env.NEXT_PUBLIC_FLYWIRE_ENV ?? '(vacío)',
    recipient: rec ?? '(vacío)',
    // Los secretos solo se reportan como presentes/ausentes.
    has_shared_secret: !!process.env.FLYWIRE_SHARED_SECRET,
    has_client_id: !!process.env.ZOHO_CLIENT_ID, // referencia; no aplica a Flywire
    // Señales de coherencia
    // El aviso que importa: en el dominio real, cualquier valor distinto de
    // 'production' manda a los estudiantes a la pasarela de pruebas.
    env_ok: process.env.NEXT_PUBLIC_FLYWIRE_ENV === 'production',
    aviso: process.env.NEXT_PUBLIC_FLYWIRE_ENV === 'production' ? null
      : 'MODO PRUEBA: el boton Pagar del dominio real esta bloqueado para que ningun estudiante pague en la pasarela demo',
    recipient_len: rec ? rec.length : 0,
    build_sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
  })
}
