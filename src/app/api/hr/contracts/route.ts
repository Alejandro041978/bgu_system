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

    const supabase = supabaseAdmin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('hr_contracts')
      .insert({
        employee_id: body.employee_id,
        contract_type: body.contract_type,
        position: body.position,
        start_date: body.start_date,
        end_date: body.end_date || null,
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
