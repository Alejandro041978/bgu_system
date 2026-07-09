import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST (multipart) → registra una evaluación EXTERNA (dictamen previo) sin IA.
// Campos: employee_id, status ('approved'|'rejected'), approved_level (si aprobado), file (opcional).
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const fd = await req.formData()
  const employeeId = fd.get('employee_id') as string | null
  const status = fd.get('status') as string | null
  const level = fd.get('approved_level') as string | null
  const file = fd.get('file') as File | null

  if (!employeeId || (status !== 'approved' && status !== 'rejected')) {
    return NextResponse.json({ error: 'Falta empleado o resultado válido' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin() as any

  let external_report_url: string | null = null
  let external_report_name: string | null = null
  if (file) {
    const ext = file.name.split('.').pop() ?? 'pdf'
    const fileName = `credentials/${employeeId}/external_${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await db.storage.from('contracts').upload(fileName, buffer, { contentType: file.type, upsert: true })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    external_report_url = db.storage.from('contracts').getPublicUrl(fileName).data.publicUrl
    external_report_name = file.name
  }

  const patch = {
    status,
    approved_level: status === 'approved' ? (level || null) : null,
    source: 'external',
    external_report_url,
    external_report_name,
    ai_report: null,
    evaluated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await db.from('faculty_credentials').select('id').eq('employee_id', employeeId).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any
  if (existing) {
    const { data, error } = await db.from('faculty_credentials').update(patch).eq('employee_id', employeeId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  } else {
    const { data, error } = await db.from('faculty_credentials').insert({ employee_id: employeeId, ...patch }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  }

  return NextResponse.json(result)
}
