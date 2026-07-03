import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = admin() as any

  const { data, error } = await db
    .from('faculty_credentials')
    .select('ai_report, employee:hr_employees(full_name)')
    .eq('id', id)
    .single()

  if (error || !data?.ai_report) {
    return NextResponse.json({ error: 'Reporte no disponible' }, { status: 404 })
  }

  const filename = `evaluacion_${(data.employee?.full_name ?? 'docente').replace(/\s+/g, '_')}.txt`
  return new NextResponse(data.ai_report, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
