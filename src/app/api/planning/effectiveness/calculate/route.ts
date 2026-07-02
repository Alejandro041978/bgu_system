import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = any

// Returns { [formula_type]: number } for the given date range
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get('start_date')
  const end = req.nextUrl.searchParams.get('end_date')
  if (!start || !end) return NextResponse.json({ error: 'start_date y end_date requeridos' }, { status: 400 })

  const sb: AnyDB = db()
  const results: Record<string, number> = {}

  // ── 1. DIVERSIDAD INTERNACIONAL DEL CLAUSTRO ─────────────────────────────
  // Semestres que se solapan con el periodo
  const { data: semesters } = await sb
    .from('academic_semesters')
    .select('id')
    .lte('start_date', end)
    .gte('end_date', start)

  const semesterIds: string[] = (semesters ?? []).map((s: { id: string }) => s.id)

  if (semesterIds.length > 0) {
    // Offerings en esos semestres
    const { data: offerings } = await sb
      .from('semester_offerings')
      .select('id')
      .in('semester_id', semesterIds)

    const offeringIds: string[] = (offerings ?? []).map((o: { id: string }) => o.id)

    if (offeringIds.length > 0) {
      // Docentes asignados (únicos)
      const { data: assignments } = await sb
        .from('faculty_assignments')
        .select('employee_id')
        .in('offering_id', offeringIds)

      const employeeIds = [...new Set((assignments ?? []).map((a: { employee_id: string }) => a.employee_id))]

      if (employeeIds.length > 0) {
        // Nacionalidades
        const { data: employees } = await sb
          .from('hr_employees')
          .select('nacionalidad')
          .in('id', employeeIds)
          .not('nacionalidad', 'is', null)

        const nationalities = new Set(
          (employees ?? []).map((e: { nacionalidad: string }) => e.nacionalidad?.toLowerCase().trim()).filter(Boolean)
        )
        results['faculty_nationality_diversity'] = nationalities.size
      } else {
        results['faculty_nationality_diversity'] = 0
      }
    } else {
      results['faculty_nationality_diversity'] = 0
    }
  } else {
    results['faculty_nationality_diversity'] = 0
  }

  // ── 2. BENEFICIADOS POR TIPO DE CAPACITACIÓN ─────────────────────────────
  const tipos = ['administrativa', 'tecnologica', 'academica', 'etica']

  for (const tipo of tipos) {
    const { data: caps } = await sb
      .from('capacitaciones')
      .select('id')
      .eq('tipo', tipo)
      .lte('fecha_inicio', end)
      .or(`fecha_termino.is.null,fecha_termino.gte.${start}`)

    const capIds: string[] = (caps ?? []).map((c: { id: string }) => c.id)

    if (capIds.length > 0) {
      const { data: parts } = await sb
        .from('capacitacion_participantes')
        .select('employee_id')
        .in('capacitacion_id', capIds)

      const unique = new Set((parts ?? []).map((p: { employee_id: string }) => p.employee_id))
      results[`capacitacion_beneficiados_${tipo}`] = unique.size
    } else {
      results[`capacitacion_beneficiados_${tipo}`] = 0
    }
  }

  // ── 3. TOTAL BENEFICIADOS (todos los tipos) ───────────────────────────────
  const { data: allCaps } = await sb
    .from('capacitaciones')
    .select('id')
    .lte('fecha_inicio', end)
    .or(`fecha_termino.is.null,fecha_termino.gte.${start}`)

  const allCapIds: string[] = (allCaps ?? []).map((c: { id: string }) => c.id)

  if (allCapIds.length > 0) {
    const { data: allParts } = await sb
      .from('capacitacion_participantes')
      .select('employee_id')
      .in('capacitacion_id', allCapIds)

    const unique = new Set((allParts ?? []).map((p: { employee_id: string }) => p.employee_id))
    results['capacitacion_beneficiados_total'] = unique.size
  } else {
    results['capacitacion_beneficiados_total'] = 0
  }

  return NextResponse.json(results)
}
