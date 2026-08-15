import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { auditarRegistro } from '@/lib/registry-audit'

export const revalidate = 0
export const maxDuration = 120

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  try {
    return NextResponse.json(await auditarRegistro(db()))
  } catch (e) {
    // El error se responde. Un auditor que devuelve una lista vacía cuando falla
    // dice "todo en orden", que es exactamente lo contrario de para lo que está.
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo auditar' }, { status: 500 })
  }
}
