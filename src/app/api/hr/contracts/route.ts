import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json() as {
      employee_id: string
      contract_type: string
      position: string
      start_date: string
      end_date?: string
      salary?: number
      currency?: string
      file_url?: string
      notes?: string
      academic_year_id?: string
    }

    if (!body.start_date || !body.end_date) {
      return NextResponse.json({ error: 'El contrato requiere fecha de inicio y de término' }, { status: 400 })
    }
    if (body.end_date < body.start_date) {
      return NextResponse.json({ error: 'La fecha de término no puede ser anterior a la de inicio' }, { status: 400 })
    }

    const supabase = supabaseAdmin()

    // Compuertas (regla institucional, 2026-07):
    //  1. Contrato de un docente → obligatorio asignarlo a un año académico.
    //  2. Con año asignado → la vigencia completa debe caer DENTRO del año.
    // Van aquí y no solo en el formulario: la API es la única puerta real.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: emp } = await (supabase as any).from('hr_employees')
      .select('is_faculty').eq('id', body.employee_id).maybeSingle()
    if (!emp) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
    if (emp.is_faculty && !body.academic_year_id) {
      return NextResponse.json({ error: 'Este colaborador es docente: su contrato debe asignarse a un año académico' }, { status: 400 })
    }
    if (body.academic_year_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: year } = await (supabase as any).from('academic_years')
        .select('name, start_date, end_date').eq('id', body.academic_year_id).maybeSingle()
      if (!year) return NextResponse.json({ error: 'Año académico no encontrado' }, { status: 404 })
      if (year.start_date && year.end_date && (body.start_date < year.start_date || body.end_date > year.end_date)) {
        return NextResponse.json({
          error: `Las fechas del contrato deben caer dentro de ${year.name} (${year.start_date} → ${year.end_date})`,
        }, { status: 400 })
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('hr_contracts')
      .insert({
        employee_id: body.employee_id,
        contract_type: body.contract_type,
        position: body.position,
        start_date: body.start_date,
        end_date: body.end_date,
        salary: body.salary || null,
        currency: body.currency ?? 'PEN',
        file_url: body.file_url || null,
        notes: body.notes || null,
        academic_year_id: body.academic_year_id || null,
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ id: (data as { id: string }).id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
