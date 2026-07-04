import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/sofia/debug-wa — inspecciona la tabla whatsapp_sessions y prueba un insert
export async function GET() {
  const sb = db() as any
  const result: Record<string, unknown> = {}

  // 1. Esquema real (columnas) + muestra
  const { data: sample, error: selErr } = await sb
    .from('whatsapp_sessions')
    .select('*')
    .limit(3)
  result.select_error = selErr?.message ?? null
  result.columns = sample?.[0] ? Object.keys(sample[0]) : []
  result.row_count_sample = (sample ?? []).length
  result.rows = (sample ?? []).map((r: any) => ({
    phone: r.phone, identified: r.identified,
    has_user_info: !!r.user_info, updated_at: r.updated_at,
  }))

  // 2. Prueba de insert con un teléfono sentinela
  const testPhone = 'whatsapp:+000000000-debug'
  await sb.from('whatsapp_sessions').delete().eq('phone', testPhone)
  const { error: insErr } = await sb.from('whatsapp_sessions').insert({
    phone: testPhone,
    messages: [{ role: 'user', content: 'test' }],
    pending_ticket: null,
    identified: true,
    user_info: { name: 'Test', role: 'estudiante' },
    updated_at: new Date().toISOString(),
  })
  result.insert_error = insErr?.message ?? 'OK (insert exitoso)'

  // 3. Leer de vuelta
  const { data: readBack } = await sb
    .from('whatsapp_sessions')
    .select('phone, identified, user_info')
    .eq('phone', testPhone)
    .limit(1)
  result.read_back = readBack?.[0] ?? null

  // limpiar
  await sb.from('whatsapp_sessions').delete().eq('phone', testPhone)

  return NextResponse.json(result)
}
