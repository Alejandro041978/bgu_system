import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { moodleConfigured, suspendedByMoodleIds } from '@/lib/moodle'
import { planAccess } from '@/lib/moodle-access'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// ---------------------------------------------------------------------------
// ¿El campus está respetando la restricción por deuda?
//
// El ERP guarda en moodle_suspended lo que él CREE haber hecho. Si alguien
// reactiva una cuenta desde la administración de Moodle, esa creencia se queda
// desfasada y el motor deja de actuar: para él la cuenta ya está suspendida,
// así que no vuelve a suspenderla nunca. La restricción se cae en silencio.
//
// Esto compara tres cosas que hasta ahora nadie confrontaba:
//   lo que DEBERÍA ser  (deuda vencida y sin excepción vigente)
//   lo que el ERP CREE  (moodle_suspended)
//   lo que Moodle DICE  (el campo suspended de la cuenta, leído del campus)
//
// Sólo lee. Con ?corregir=1 vuelve a aplicar lo que debería ser.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const g = await requireStaff(); if ('error' in g) return g.error
  if (!moodleConfigured()) return NextResponse.json({ error: 'Moodle no está configurado' }, { status: 400 })
  const sb = db()

  const plan = await planAccess(sb)
  const conCuenta = plan.filter(p => p.moodle_user_id)
  const real = await suspendedByMoodleIds(conCuenta.map(p => Number(p.moodle_user_id)))

  const liberadosPorFuera: typeof conCuenta = []   // debería estar cerrado y en Moodle está abierto
  const cerradosDeMas: typeof conCuenta = []       // no debería estar cerrado y en Moodle lo está
  const erpDesfasado: typeof conCuenta = []        // el ERP cree una cosa y Moodle dice otra
  const noVerificables: typeof conCuenta = []      // Moodle no devolvió la cuenta

  for (const p of conCuenta) {
    const enMoodle = real.get(Number(p.moodle_user_id))
    if (enMoodle === undefined) { noVerificables.push(p); continue }
    if (enMoodle !== p.currently_suspended) erpDesfasado.push(p)
    if (p.desired_suspended && !enMoodle) liberadosPorFuera.push(p)
    if (!p.desired_suspended && enMoodle) cerradosDeMas.push(p)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fila = (p: any) => ({
    student_id: p.student_id, nombre: p.name ?? p.full_name ?? null,
    documento: p.document_number ?? null,
    vencido: p.overdue ?? null,
    excepcion_hasta: p.exception_until ?? null,
    deberia_estar_suspendido: p.desired_suspended,
    el_erp_cree: p.currently_suspended,
    en_moodle: real.get(Number(p.moodle_user_id)) ?? null,
    moodle_user_id: p.moodle_user_id,
  })

  return NextResponse.json({
    verificados: conCuenta.length,
    sin_cuenta_moodle: plan.length - conCuenta.length,
    // El hallazgo que se buscaba: cuentas que deberían estar cerradas por deuda
    // y en el campus están abiertas. Alguien las liberó a mano, o la suspensión
    // nunca llegó a aplicarse.
    liberados_por_fuera: liberadosPorFuera.length,
    cerrados_de_mas: cerradosDeMas.length,
    // El ERP y Moodle no coinciden, en cualquier dirección: mientras esto no sea
    // cero, el motor de accesos está tomando decisiones sobre un dato falso.
    erp_desfasado: erpDesfasado.length,
    no_verificables: noVerificables.length,
    detalle: {
      liberados_por_fuera: liberadosPorFuera.map(fila),
      cerrados_de_mas: cerradosDeMas.map(fila),
      erp_desfasado: erpDesfasado.map(fila),
    },
  })
}
