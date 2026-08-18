import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { auditarImportesFlywire } from '@/lib/flywire-amounts'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// ¿Está en el ERP todo lo que Flywire entregó, y por el importe exacto?
//
// Existe aparte de "Flywire · Sin conciliar" porque aquella pantalla solo mira
// avisos del webhook —filtra por firma válida— y los giros que entraron por
// importación de CSV nunca tuvieron firma. Eran 52 transferencias entregadas,
// $9.757, que no aparecían en ninguna bandeja del ERP (18/08/2026).
//
// Aquí se parte de los giros ENTREGADOS, vengan del webhook o del CSV, y se
// contrasta contra lo que el estado de cuenta tiene registrado.
// ---------------------------------------------------------------------------
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  return NextResponse.json(await auditarImportesFlywire(db()))
}
