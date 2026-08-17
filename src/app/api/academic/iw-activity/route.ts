import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { auditarActividadIW } from '@/lib/iw-activity'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  try {
    return NextResponse.json(await auditarActividadIW(db()))
  } catch (e) {
    // El error se responde. Un contraste que devuelve cero cuando falla diría
    // "todos los IW son efectivos", que es justo lo contrario de para lo que está.
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo consultar' }, { status: 500 })
  }
}
