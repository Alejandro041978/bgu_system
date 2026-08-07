import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { generateChargesForEnrollment } from '@/lib/billing'
import { plantillaDe, inicioDeClases, primeraCuota } from '@/lib/billing-template'

export const revalidate = 0
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Generar las cuotas que faltan cuando la plantilla se creó DESPUÉS.
//
// Al matricular, las cuotas nacen solas. Pero si el programa todavía no tenía
// plantilla, la matrícula queda sin ninguna — y hasta ahora la única salida era
// entrar al estado de cuenta de cada estudiante y pulsar el botón uno por uno.
//
// Configurar una plantilla nueva y tener que acordarse de a quién le faltaba es
// exactamente el tipo de tarea que se olvida a medias. Aquí se ve la lista
// completa y se resuelve de una vez.

// GET → quiénes están sin cuotas y qué les pasaría.
export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leerTodo = async (t: string, c: string): Promise<any[]> => {
    const out: unknown[] = []
    for (let d = 0; ; d += 1000) {
      const { data } = await sb.from(t).select(c).range(d, d + 999)
      out.push(...(data ?? []))
      if ((data ?? []).length < 1000) break
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return out as any[]
  }

  const enr = await leerTodo('academic_student_enrollments', 'id, student_id, program_id, convocatoria_id, collection_id, status')
  const ch = await leerTodo('account_charges', 'enrollment_id')
  const conCuotas = new Set(ch.map(c => c.enrollment_id).filter(Boolean))
  const sin = enr.filter(e => !conCuotas.has(e.id))

  const progs = await leerTodo('academic_programs', 'id, name')
  const studs = await leerTodo('academic_students', 'id, first_name, last_name, second_last_name, document_number')
  const P = new Map(progs.map(p => [p.id, p.name]))
  const S = new Map(studs.map(s => [s.id, s]))

  // Se resuelve la plantilla de cada uno para decir por adelantado quién puede
  // y quién no: una lista donde la mitad va a fallar no sirve para decidir.
  const filas = []
  const cachePlantilla = new Map<string, unknown>()
  for (const e of sin) {
    const clave = `${e.collection_id ?? '-'}|${e.program_id}`
    if (!cachePlantilla.has(clave)) cachePlantilla.set(clave, await plantillaDe(sb, e.program_id, e.collection_id ?? null))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = cachePlantilla.get(clave) as any
    const inicio = await inicioDeClases(sb, e.convocatoria_id)
    const s = S.get(e.student_id)
    filas.push({
      enrollment_id: e.id,
      estudiante: s ? [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ') : '—',
      documento: s?.document_number ?? null,
      programa: P.get(e.program_id) ?? '—',
      plantilla: plan?.name ?? null,
      origen: plan?.origen ?? null,
      primera_cuota: inicio && plan?.installments_count > 0 ? primeraCuota(inicio) : null,
      cuotas: plan ? `${plan.registration_fee > 0 ? plan.registration_fee + ' + ' : ''}${plan.installments_count} × ${plan.installment_amount}` : null,
      motivo: !plan ? 'su programa no tiene plantilla (ni por colección ni por categoría)'
        : (!inicio && plan.installments_count > 0) ? 'su convocatoria no tiene fecha de inicio de clases'
        : null,
    })
  }
  filas.sort((a, b) => Number(!!a.motivo) - Number(!!b.motivo) || a.estudiante.localeCompare(b.estudiante))
  return NextResponse.json({ total: filas.length, listas: filas.filter(f => !f.motivo).length, filas })
}

// POST → genera. Sin cuerpo: todas las que puedan. Con enrollment_ids: solo esas.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const b = await req.json().catch(() => null) as { enrollment_ids?: string[] } | null
  const ids = b?.enrollment_ids ?? []
  if (!ids.length) return NextResponse.json({ error: 'No hay matrículas seleccionadas' }, { status: 400 })

  let hechas = 0
  const errores: { enrollment_id: string; error: string }[] = []
  for (const id of ids) {
    // generateChargesForEnrollment es idempotente: si ya tiene cuotas, no hace
    // nada. Así, pulsar dos veces no puede duplicar el cobro de nadie.
    const r = await generateChargesForEnrollment(id)
    if (r.ok) hechas++
    else errores.push({ enrollment_id: id, error: r.error })
  }
  return NextResponse.json({ ok: true, generadas: hechas, errores })
}
