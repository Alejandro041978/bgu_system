import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const employeeId = formData.get('employee_id') as string | null
  const fileType = formData.get('file_type') as string | null // 'cv' | 'degree' | 'second_title'

  if (!file || !employeeId || !fileType) {
    return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'pdf'
  const fileName = `credentials/${employeeId}/${fileType}_${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const supabase = admin()
  const { error } = await (supabase as any).storage
    .from('contracts')
    .upload(fileName, buffer, { contentType: file.type, upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = (supabase as any).storage.from('contracts').getPublicUrl(fileName)

  // Upsert credential record
  const db = supabase as any
  const fieldUrl = `${fileType}_url`
  const fieldName = `${fileType}_name`

  // Check if credential record exists
  const { data: existing } = await db
    .from('faculty_credentials')
    .select('id')
    .eq('employee_id', employeeId)
    .single()

  const dbRes = existing
    ? await db.from('faculty_credentials')
        .update({ [fieldUrl]: data.publicUrl, [fieldName]: file.name, updated_at: new Date().toISOString() })
        .eq('employee_id', employeeId)
    : await db.from('faculty_credentials')
        .insert({ employee_id: employeeId, [fieldUrl]: data.publicUrl, [fieldName]: file.name })
  if (dbRes.error) return NextResponse.json({ error: dbRes.error.message }, { status: 500 })

  return NextResponse.json({ url: data.publicUrl, name: file.name })
}
