import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { primeraCuota } from '@/lib/billing-template'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Plantillas de facturación por programa/categoría.
//
// Ya no llevan fecha: la primera cuota se calcula del inicio de clases de la
// convocatoria (día 1 del mes siguiente a inicio + 20 días). Por eso una misma
// plantilla sirve para todos los llamados de un programa.

export async function GET() {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const sb = db()

  const [{ data: templates }, { data: targets }, { data: progs }, { data: cats }, { data: concepts }] = await Promise.all([
    sb.from('billing_templates').select('*').order('name'),
    sb.from('billing_template_targets').select('*'),
    sb.from('academic_programs').select('id, name, category_id').order('name'),
    sb.from('academic_programs_category').select('id, name').order('name'),
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
    programs: progs ?? [], categories: cats ?? [], concepts: concepts ?? [],
    huerfanos,
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
    program_ids?: string[]; category_ids?: string[]
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
    ...(b.program_ids ?? []).map(program_id => ({ template_id: t.id, program_id, category_id: null })),
    ...(b.category_ids ?? []).map(category_id => ({ template_id: t.id, program_id: null, category_id })),
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
