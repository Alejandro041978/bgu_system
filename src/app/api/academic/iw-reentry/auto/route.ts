import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { guardStaff } from '@/lib/api-guard'
import { wdb } from '@/lib/withdrawals'
import { evaluarAutoIW, leerSettings, DIAS_IW, DIAS_PREAVISO } from '@/lib/auto-iw'

export const revalidate = 0
export const maxDuration = 120

// Panel del IW automático dentro del Gestor IW · Re-Entry. Solo REFLEJA lo que
// el proceso nocturno hará (o haría, en modo ensayo); la única acción es el
// interruptor. La ejecución de cada IW se revisa y aprueba en el Gestor.
export async function GET() {
  const no = await guardStaff()
  if (no) return no
  const sb = wdb()
  const [settings, evaluacion] = await Promise.all([leerSettings(sb), evaluarAutoIW(sb)])
  return NextResponse.json({ settings, reglas: { dias_iw: DIAS_IW, dias_preaviso: DIAS_PREAVISO }, ...evaluacion })
}

// PATCH { enabled?, daily_cap? }
export async function PATCH(req: NextRequest) {
  const no = await guardStaff()
  if (no) return no
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  const b = await req.json().catch(() => null) as { enabled?: boolean; daily_cap?: number } | null
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { id: 1, updated_at: new Date().toISOString(), updated_by: user?.email ?? null }
  if (typeof b.enabled === 'boolean') patch.enabled = b.enabled
  if (b.daily_cap !== undefined) {
    const n = Number(b.daily_cap)
    if (!Number.isInteger(n) || n < 1 || n > 100) return NextResponse.json({ error: 'El tope diario debe ser un entero entre 1 y 100' }, { status: 400 })
    patch.daily_cap = n
  }
  const { error } = await wdb().from('auto_iw_settings').upsert(patch, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: `No se pudo guardar (¿falta correr supabase/auto_iw.sql?): ${error.message}` }, { status: 500 })
  return NextResponse.json({ ok: true })
}
