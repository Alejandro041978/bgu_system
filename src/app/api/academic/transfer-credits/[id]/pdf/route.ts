import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { generateTransferCreditPdf, type TCRow } from '@/lib/generate-transfer-credit-pdf'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const dateParam = req.nextUrl.searchParams.get('date') // YYYY-MM-DD opcional
  const sb = db()

  const { data: tc } = await sb.from('transfer_credits').select('*').eq('id', id).maybeSingle()
  if (!tc) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const { data: prog } = tc.dest_program_id
    ? await sb.from('academic_programs').select('name').eq('id', tc.dest_program_id).maybeSingle()
    : { data: null }

  const { data: items } = await sb.from('transfer_credit_items')
    .select('*').eq('transfer_credit_id', id).order('created_at')

  // Datos de las asignaturas de destino (código, nombre, créditos)
  const destIds = [...new Set((items ?? []).map((i: { dest_course_id: string | null }) => i.dest_course_id).filter(Boolean))]
  const { data: courses } = destIds.length
    ? await sb.from('academic_courses').select('id, code, name, credits').in('id', destIds)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courseById: Record<string, any> = {}
  for (const cse of courses ?? []) courseById[cse.id] = cse

  let total = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: TCRow[] = (items ?? []).map((it: any) => {
    const cse = it.dest_course_id ? courseById[it.dest_course_id] : null
    const bguCredit = cse?.credits ?? null
    if (bguCredit != null) total += Number(bguCredit)
    return {
      originCode: it.origin_course_code ?? '',
      originTitle: it.origin_course_name ?? '',
      originCredit: it.origin_credits != null ? String(it.origin_credits) : '',
      originGrade: it.origin_grade != null ? String(it.origin_grade) : '',
      bguCode: cse?.code ?? '',
      bguTitle: cse?.name ?? it.dest_course_name ?? '',
      bguCredit: bguCredit != null ? String(bguCredit) : '',
    }
  })

  // Fecha del formato: la elegida (si viene), si no la de creación. T12:00 evita corrimiento por zona horaria.
  const dateSource = dateParam ? `${dateParam}T12:00:00` : tc.created_at
  const date = dateSource
    ? new Date(dateSource).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  const pdf = await generateTransferCreditPdf({
    studentName: tc.student_name ?? '',
    studentId: tc.student_document ?? '',
    date,
    program: prog?.name ?? '',
    originInstitution: tc.origin_institution ?? '',
    rows, totalCredits: total,
  })

  const filename = `Transfer_Credit_${(tc.student_name ?? 'estudiante').replace(/\s+/g, '_')}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
