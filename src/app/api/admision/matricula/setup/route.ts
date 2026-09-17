import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { validarPar } from '@/lib/convocatoria-setup'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Lo CARGADO en una matrícula: colección de aulas y carrusel de entrada.
//
// Regla del usuario (17/09/2026): la vendedora carga, el pago ejecuta, los
// reportes reflejan. Si lo cargado está mal o falta, se corrige AQUÍ (el dato
// en su origen, desde la ficha del estudiante) — nunca colocando a mano desde
// un reporte. Editar no ejecuta nada: la colocación la hace la activación
// (automática con el pago, o re-ejecutada con el botón Activar por excepción).
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const id = req.nextUrl.searchParams.get('enrollment_id')
  if (!id) return NextResponse.json({ error: 'Falta enrollment_id' }, { status: 400 })
  const sb = db()
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, student_id, program_id, status, activated_at, collection_id, entry_group_id').eq('id', id).maybeSingle()
  if (!enr) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 })

  const [{ data: cols }, { data: grupos }] = await Promise.all([
    sb.from('moodle_collections').select('id, name, active').eq('program_id', enr.program_id).order('name'),
    sb.from('academic_groups').select('id, abbreviation, name, next_group_id').eq('program_id', enr.program_id),
  ])
  const gs = (grupos ?? []) as { id: string; abbreviation: string | null; name: string | null; next_group_id: string | null }[]
  const glabel = (g: { abbreviation: string | null; name: string | null }) => [g.abbreviation, g.name].filter(Boolean).join(' · ')
  // Colocación EFECTIVA (la membresía real), para reflejarla junto a lo cargado
  const { data: mem } = gs.length
    ? await sb.from('academic_group_students').select('group_id, status').eq('student_id', enr.student_id).in('group_id', gs.map(g => g.id))
    : { data: [] }
  const activa = ((mem ?? []) as { group_id: string; status: string }[]).find(m => m.status === 'activo') ?? (mem ?? [])[0] ?? null
  const gEfectivo = activa ? gs.find(g => g.id === activa.group_id) : null

  return NextResponse.json({
    enrollment_id: enr.id,
    status: enr.status ?? null,
    activada: !!enr.activated_at,
    collection_id: enr.collection_id ?? null,
    entry_group_id: enr.entry_group_id ?? null,
    efectivo: gEfectivo ? { group_id: gEfectivo.id, label: glabel(gEfectivo), status: activa!.status } : null,
    colecciones: ((cols ?? []) as { id: string; name: string; active: boolean }[]).map(c => ({ id: c.id, name: c.name, active: c.active })),
    carruseles: gs.map(g => ({ id: g.id, label: glabel(g) })).sort((a, b) => a.label.localeCompare(b.label)),
  })
}

// PATCH { enrollment_id, collection_id?, entry_group_id? } → corrige lo cargado.
export async function PATCH(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado
  const b = await req.json().catch(() => null) as { enrollment_id?: string; collection_id?: string | null; entry_group_id?: string | null } | null
  if (!b?.enrollment_id) return NextResponse.json({ error: 'Falta enrollment_id' }, { status: 400 })
  const sb = db()
  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, program_id, collection_id, entry_group_id').eq('id', b.enrollment_id).maybeSingle()
  if (!enr) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 })

  const coleccion = b.collection_id === undefined ? enr.collection_id : (b.collection_id || null)
  const carrusel = b.entry_group_id === undefined ? enr.entry_group_id : (b.entry_group_id || null)
  const mal = await validarPar(sb, enr.program_id, coleccion, carrusel)
  if (mal) return NextResponse.json({ error: mal }, { status: 400 })

  const { error } = await sb.from('academic_student_enrollments')
    .update({ collection_id: coleccion, entry_group_id: carrusel }).eq('id', enr.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, collection_id: coleccion, entry_group_id: carrusel })
}
