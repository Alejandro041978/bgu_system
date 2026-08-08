import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { primeraCuota, inicioDeClases, plantillaDe } from '@/lib/billing-template'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Plantillas de facturación por programa/categoría.
//
// Ya no llevan fecha: la primera cuota se calcula del inicio de clases de la
// convocatoria (día 1 del mes siguiente a inicio + 20 días). Por eso una misma
// plantilla sirve para todos los llamados de un programa.

export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()

  // ?enrollment_id= → lista compacta para Refacturar cuotas: las plantillas con
  // su primer vencimiento YA calculado para esa matrícula. Las plantillas no
  // llevan fecha (sale del inicio de clases de la convocatoria), así que sin
  // este cálculo el diálogo no tendría qué copiar en "primer vencimiento".
  const enrollmentId = req.nextUrl.searchParams.get('enrollment_id')
  if (enrollmentId) return paraRefacturar(sb, enrollmentId)

  const [{ data: templates }, { data: targets }, { data: progs }, { data: cats }, { data: cols }, { data: concepts }] = await Promise.all([
    sb.from('billing_templates').select('*').order('name'),
    sb.from('billing_template_targets').select('*'),
    sb.from('academic_programs').select('id, name, category_id').order('name'),
    sb.from('academic_programs_category').select('id, name').order('name'),
    sb.from('moodle_collections').select('id, name, program_id, language, partner').order('name'),
    sb.from('account_concepts').select('type_code, abbr, name').eq('kind', 'charge').order('type_code'),
  ])

  // Programas sin plantilla propia ni por categoría: son los que al matricular
  // se quedarían sin cuotas, así que se dicen en voz alta.
  const conPrograma = new Set((targets ?? []).filter((t: { program_id: string | null }) => t.program_id).map((t: { program_id: string }) => t.program_id))
  const conCategoria = new Set((targets ?? []).filter((t: { category_id: string | null }) => t.category_id).map((t: { category_id: string }) => t.category_id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const huerfanos = ((progs ?? []) as any[])
    .filter(p => !conPrograma.has(p.id) && !(p.category_id && conCategoria.has(p.category_id)))
    .map(p => ({ id: p.id, name: p.name }))

  return NextResponse.json({
    templates: templates ?? [], targets: targets ?? [],
    programs: progs ?? [], categories: cats ?? [], collections: cols ?? [], concepts: concepts ?? [],
    huerfanos,
  })
}

// Plantillas listas para copiar en Refacturar cuotas, con la fecha resuelta.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function paraRefacturar(sb: any, enrollmentId: string) {
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, program_id, collection_id, convocatoria_id').eq('id', enrollmentId).maybeSingle()
  if (!enr) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 })

  const [{ data: templates }, { data: targets }, { data: progs }, { data: cats }, { data: cols }] = await Promise.all([
    sb.from('billing_templates').select('*').order('name'),
    sb.from('billing_template_targets').select('*'),
    sb.from('academic_programs').select('id, name, category_id'),
    sb.from('academic_programs_category').select('id, name'),
    sb.from('moodle_collections').select('id, name'),
  ])
  const nombreProg = new Map((progs ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
  const nombreCat = new Map((cats ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))
  const nombreCol = new Map((cols ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))

  const inicio = await inicioDeClases(sb, enr.convocatoria_id)
  const primera = inicio ? primeraCuota(inicio) : null
  // Cuál es LA que le corresponde a esta matrícula (colección → programa →
  // categoría). Se marca para que quien refactura no tenga que deducirlo.
  const suya = await plantillaDe(sb, enr.program_id, enr.collection_id ?? null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const destinos = (t: any) => (targets ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((x: any) => x.template_id === t.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((x: any) => nombreCol.get(x.collection_id) ?? nombreProg.get(x.program_id) ?? nombreCat.get(x.category_id) ?? '—')

  return NextResponse.json({
    // Mismos nombres de campo que el diálogo ya usaba, para que copiar un plan
    // siga siendo copiar un plan.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plans: (templates ?? []).map((t: any) => ({
      id: t.id, name: t.name,
      installments_count: t.installments_count, installment_amount: t.installment_amount,
      installment_concept: t.installment_concept,
      first_due_date: primera, due_day: null,
      destinos: destinos(t),
      es_la_suya: suya?.id === t.id,
    })),
    primera_cuota: primera,
    sin_inicio_de_clases: !inicio,
  })
}

// POST → crea o actualiza una plantilla y sus destinos.
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const b = await req.json().catch(() => null) as {
    id?: string; name?: string; currency?: string
    registration_fee?: number; registration_concept?: number | null
    installments_count?: number; installment_amount?: number; installment_concept?: number | null
    program_ids?: string[]; category_ids?: string[]; collection_ids?: string[]
  } | null
  if (!b?.name?.trim()) return NextResponse.json({ error: 'Ponle un nombre a la plantilla' }, { status: 400 })
  const sb = db()

  const fila = {
    name: b.name.trim(),
    currency: b.currency || 'USD',
    registration_fee: Number(b.registration_fee ?? 0),
    registration_concept: b.registration_concept ?? null,
    installments_count: Number(b.installments_count ?? 0),
    installment_amount: Number(b.installment_amount ?? 0),
    installment_concept: b.installment_concept ?? null,
    updated_at: new Date().toISOString(),
  }
  const { data: t, error } = b.id
    ? await sb.from('billing_templates').update(fila).eq('id', b.id).select('id').single()
    : await sb.from('billing_templates').insert(fila).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Los destinos se reemplazan en bloque: es más simple de entender que un
  // diff, y son pocos.
  await sb.from('billing_template_targets').delete().eq('template_id', t.id)
  const filas = [
    ...(b.collection_ids ?? []).map(collection_id => ({ template_id: t.id, collection_id, program_id: null, category_id: null })),
    ...(b.program_ids ?? []).map(program_id => ({ template_id: t.id, collection_id: null, program_id, category_id: null })),
    ...(b.category_ids ?? []).map(category_id => ({ template_id: t.id, collection_id: null, program_id: null, category_id })),
  ]
  if (filas.length) {
    const { error: e2 } = await sb.from('billing_template_targets').insert(filas)
    if (e2) {
      // El índice único protege la regla "un programa, una plantilla". Si salta,
      // es que ese programa ya está en otra: decirlo es más útil que un código.
      return NextResponse.json({
        error: /duplicate|unique/i.test(e2.message)
          ? 'Alguno de esos programas o categorías ya está asignado a otra plantilla. Quítalo de la otra primero.'
          : e2.message,
      }, { status: 409 })
    }
  }
  return NextResponse.json({ ok: true, id: t.id })
}

export async function DELETE(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const b = await req.json().catch(() => null) as { id?: string } | null
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await db().from('billing_templates').delete().eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH { first_day } → simulador de la regla de fechas, para la pantalla.
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const b = await req.json().catch(() => null) as { first_day?: string } | null
  if (!b?.first_day) return NextResponse.json({ error: 'Falta la fecha' }, { status: 400 })
  return NextResponse.json({ primera_cuota: primeraCuota(b.first_day) })
}
