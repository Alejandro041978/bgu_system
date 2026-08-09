import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isSuperadmin, isStudentUser } from '@/lib/student-identity'
import { bitrixConfigurado, crearEmbudoReferidos, ordenarEtapasReferidos, EMBUDO_REFERIDOS } from '@/lib/bitrix'

export const revalidate = 0

// POST → crea (o reutiliza) el embudo fijo de Free Degree en Bitrix.
//
// Escribe en el CRM de la institución, así que pide superadministrador: crear
// un embudo lo ve todo el equipo comercial y no es algo que deba poder
// disparar cualquiera que tenga sesión.
//
// Es idempotente: correrlo dos veces no crea dos embudos.
export async function POST() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // isSuperadmin() da true para quien no está en hr_employees, y un estudiante
  // tampoco lo está: hay que rechazarlos explícitamente primero.
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (!(await isSuperadmin(user.id))) {
    return NextResponse.json({ error: 'Solo el superadministrador puede crear embudos en el CRM' }, { status: 403 })
  }
  if (!bitrixConfigurado()) return NextResponse.json({ error: 'Falta BITRIX_WEBHOOK_URL' }, { status: 400 })

  try {
    const r = await crearEmbudoReferidos()
    // Recién creado, el embudo trae las etapas genéricas de Bitrix: se les pone
    // el vocabulario del programa y el umbral queda en su lugar.
    const orden = await ordenarEtapasReferidos()
    return NextResponse.json({
      ok: true, ...r, etapas: orden.etapas, renombradas: orden.renombradas, etapa_umbral: orden.etapa_umbral,
      nota: r.creado
        ? `Embudo "${r.nombre}" creado. Las negociaciones de referidos nacerán aquí.`
        : `El embudo "${r.nombre}" ya existía; se reutiliza.`,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), embudo_buscado: EMBUDO_REFERIDOS }, { status: 502 })
  }
}
