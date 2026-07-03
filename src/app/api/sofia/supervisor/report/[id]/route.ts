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
    .from('sofia_supervisor_reports')
    .select('full_report, report_date')
    .eq('id', id)
    .single()

  if (error || !data?.full_report) {
    return NextResponse.json({ error: 'Reporte no disponible' }, { status: 404 })
  }

  const filename = `supervisor_sofia_${data.report_date}.txt`
  return new NextResponse(data.full_report, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
