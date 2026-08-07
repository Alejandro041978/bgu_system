import { primeraCuota, vencimientoCuota } from '@/lib/billing-template'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Mover una matrícula de convocatoria.
//
// El caso real: el estudiante se matricula y pide no empezar este mes sino más
// adelante. No cambia lo que estudia ni lo que debe —cambia CUÁNDO empieza—,
// así que se cambia el llamado y se corren los vencimientos pendientes al
// calendario del nuevo. Los importes no se tocan: refasear no es refacturar, y
// confundirlos es el error caro (para cambiar montos ya está Refacturar cuotas).
//
// Lo que NO se mueve:
//  · Una cuota con pago o descuento. Ya hubo dinero de por medio; correrle la
//    fecha reescribiría un hecho pasado. Se quedan y se informan.
//  · Una cuota con un trámite o examen colgando. Su fecha ya se le comunicó al
//    estudiante como plazo de ese trámite.
//  · El concepto inicial, que no tiene vencimiento: se paga para activar.

const r2 = (d: Date) => d.toISOString().slice(0, 10)

// Vencimiento i-ésimo a partir del primero, respetando el día de corte.
function vencimiento(primero: string, i: number, diaCorte: number | null): string {
  const base = new Date(primero + 'T12:00:00')
  const d = new Date(base)
  d.setMonth(d.getMonth() + i)
  if (diaCorte) {
    // Día 31 en un mes de 30: el 0 del mes siguiente es el último día de este.
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(diaCorte, ultimo))
  }
  return r2(d)
}

export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const b = await req.json().catch(() => null) as {
    enrollment_id?: string; convocatoria_id?: string; apply?: boolean
  } | null
  if (!b?.enrollment_id || !b?.convocatoria_id) {
    return NextResponse.json({ error: 'Faltan la matrícula y la convocatoria de destino' }, { status: 400 })
  }
  const sb = db()

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, program_id, convocatoria_id, enrollment_date, status')
    .eq('id', b.enrollment_id).maybeSingle()
  if (!enr) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 })
  if (enr.convocatoria_id === b.convocatoria_id) {
    return NextResponse.json({ error: 'La matrícula ya está en esa convocatoria' }, { status: 409 })
  }

  const { data: prog } = await sb.from('academic_programs')
    .select('id, name, category_id').eq('id', enr.program_id).maybeSingle()
  const { data: destino } = await sb.from('convocatorias')
    .select('id, name, product_category_id, first_day, deadline_date').eq('id', b.convocatoria_id).maybeSingle()
  if (!destino) return NextResponse.json({ error: 'Convocatoria de destino no encontrada' }, { status: 404 })

  // Un llamado sirve a una categoría. Mover un Master a una convocatoria de
  // Bachelor lo dejaría fuera de todos los informes por convocatoria y de la
  // bandeja de colocación, sin que nada avisara.
  if (prog?.category_id && destino.product_category_id && prog.category_id !== destino.product_category_id) {
    return NextResponse.json({
      error: 'Esa convocatoria es de otra categoría de programa: no corresponde a este programa',
    }, { status: 409 })
  }

  const { data: origen } = enr.convocatoria_id
    ? await sb.from('convocatorias').select('id, name, first_day').eq('id', enr.convocatoria_id).maybeSingle()
    : { data: null }

  // ── Cuotas ───────────────────────────────────────────────────────────────
  const { data: cargos } = await sb.from('account_charges')
    .select('external_id, amount, due_date, charge_type, is_initial').eq('enrollment_id', enr.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todas = ((cargos ?? []) as any[])
  const ids = todas.map(c => c.external_id)

  const congelan = new Map<string, string>()
  if (ids.length) {
    const { data: pagos } = await sb.from('account_payments')
      .select('charge_external_id, series_code').in('charge_external_id', ids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of ((pagos ?? []) as any[])) {
      congelan.set(p.charge_external_id, p.series_code === 'DESCUENTO' ? 'tiene un descuento aplicado' : 'ya tiene pago')
    }
    const { data: docs } = await sb.from('document_requests').select('charge_external_id').in('charge_external_id', ids)
    for (const d of (docs ?? []) as { charge_external_id: string }[]) congelan.set(d.charge_external_id, 'financia una solicitud de documento')
    const { data: exams } = await sb.from('exam_requests').select('charge_external_id').in('charge_external_id', ids)
    for (const e of (exams ?? []) as { charge_external_id: string }[]) congelan.set(e.charge_external_id, 'financia un examen')
  }

  const movibles = todas
    .filter(c => c.due_date && !c.is_initial && !congelan.has(c.external_id))
    .sort((a, b2) => String(a.due_date).localeCompare(String(b2.due_date)))
  const quietas = todas
    .filter(c => congelan.has(c.external_id) || c.is_initial || !c.due_date)
    .map(c => ({
      external_id: c.external_id, amount: Number(c.amount), due_date: c.due_date,
      motivo: congelan.get(c.external_id) ?? (c.is_initial ? 'es el concepto inicial' : 'no tiene vencimiento'),
    }))

  // Una solicitud cashpay pendiente guarda los external_id de las cuotas que
  // adelanta, y su descuento se calculó sobre las fechas de HOY. Correrlas por
  // debajo la dejaría prometiendo un beneficio sobre otro calendario. Se aborta
  // solo si toca alguna de las que vamos a mover — misma regla que refacturar.
  const { data: cash } = await sb.from('cashpay_requests')
    .select('id, charges').eq('student_id', enr.student_id).eq('status', 'pendiente')
  for (const r of (cash ?? []) as { id: string; charges: unknown }[]) {
    const lista: string[] = Array.isArray(r.charges) ? r.charges as string[] : []
    if (lista.some(x => movibles.some(c => c.external_id === x))) {
      return NextResponse.json({
        error: 'Hay una solicitud de cash pay pendiente sobre estas cuotas. Resuélvela (aprobar o rechazar) antes de mover la matrícula: su descuento se calculó sobre los vencimientos actuales.',
      }, { status: 409 })
    }
  }

  // ── De dónde salen las fechas nuevas ─────────────────────────────────────
  // Del INICIO DE CLASES del llamado destino, con la misma regla que usa la
  // matrícula nueva: día 1 del mes siguiente a inicio + 20 días. Antes se leía
  // de una plantilla por (programa, convocatoria) que casi nunca existía —345
  // pares tenían estudiantes y ninguna plantilla—, así que el caso normal era
  // el respaldo, no la regla.
  let regla: string
  let nuevas: { external_id: string; amount: number; de: string; a: string }[] = []

  if (destino.first_day) {
    const primera = primeraCuota(destino.first_day)
    regla = `calendario de ${destino.name}: clases desde el ${String(destino.first_day).slice(0, 10)}, primera cuota el ${primera}`
    nuevas = movibles.map((c, i) => ({
      external_id: c.external_id, amount: Number(c.amount), de: String(c.due_date),
      a: vencimientoCuota(primera, i),
    }))
  } else if (origen?.first_day && destino.first_day) {
    const dias = Math.round(
      (new Date(destino.first_day + 'T12:00:00').getTime() - new Date(origen.first_day + 'T12:00:00').getTime()) / 86400000
    )
    regla = `sin plantilla para ${destino.name}: se corren ${dias} día(s), la diferencia entre los inicios de ambos llamados`
    nuevas = movibles.map(c => {
      const d = new Date(String(c.due_date) + 'T12:00:00')
      d.setDate(d.getDate() + dias)
      return { external_id: c.external_id, amount: Number(c.amount), de: String(c.due_date), a: r2(d) }
    })
  } else {
    regla = 'no hay plantilla del destino ni fechas de inicio en ambos llamados: las cuotas conservan su vencimiento'
    nuevas = []
  }

  const preview = {
    ok: true,
    estudiante: enr.student_id,
    programa: prog?.name ?? null,
    de: origen?.name ?? '(sin convocatoria)',
    a: destino.name,
    regla,
    mueve: nuevas,
    quietas,
    aplicado: false as boolean,
  }
  if (!b.apply) return NextResponse.json(preview)

  // ── Aplicar ──────────────────────────────────────────────────────────────
  const { error: eEnr } = await sb.from('academic_student_enrollments')
    .update({ convocatoria_id: destino.id }).eq('id', enr.id)
  if (eEnr) return NextResponse.json({ error: eEnr.message }, { status: 500 })

  // Las cuotas siguen a su matrícula, TODAS, incluidas las congeladas: si no,
  // el mismo estudiante saldría repartido entre dos convocatorias en los
  // informes de recaudación. Congelada es la FECHA, no la pertenencia.
  if (ids.length) {
    await sb.from('account_charges').update({ convocatoria_id: destino.id }).eq('enrollment_id', enr.id)
  }
  for (const n of nuevas) {
    await sb.from('account_charges').update({ due_date: n.a }).eq('external_id', n.external_id)
  }

  return NextResponse.json({ ...preview, aplicado: true })
}
