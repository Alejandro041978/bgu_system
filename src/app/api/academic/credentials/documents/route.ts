import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// POST (multipart) → sube un documento adicional (máx 3) del docente y lo agrega
// a faculty_credentials.additional_documents. Crea el registro si no existe.
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  const employeeId = fd.get('employee_id') as string | null
  if (!file || !employeeId) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin() as any

  const { data: cred } = await db.from('faculty_credentials').select('id, additional_documents').eq('employee_id', employeeId).single()
  const current: { url: string; name: string }[] = cred?.additional_documents ?? []
  if (current.length >= 3) return NextResponse.json({ error: 'Máximo 3 documentos adicionales' }, { status: 400 })

  const ext = file.name.split('.').pop() ?? 'pdf'
  const fileName = `credentials/${employeeId}/extra_${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await db.storage.from('contracts').upload(fileName, buffer, { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const url = db.storage.from('contracts').getPublicUrl(fileName).data.publicUrl

  const next = [...current, { url, name: file.name }]
  if (cred) {
    const { error } = await db.from('faculty_credentials').update({ additional_documents: next, updated_at: new Date().toISOString() }).eq('id', cred.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await db.from('faculty_credentials').insert({ employee_id: employeeId, additional_documents: next })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ additional_documents: next })
}

// DELETE ?employee_id=&url= → quita un documento adicional (de la lista y del storage)
export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const employeeId = req.nextUrl.searchParams.get('employee_id')
  const url = req.nextUrl.searchParams.get('url')
  if (!employeeId || !url) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin() as any
  const { data: cred } = await db.from('faculty_credentials').select('id, additional_documents').eq('employee_id', employeeId).single()
  if (!cred) return NextResponse.json({ error: 'Sin credencial' }, { status: 404 })

  const current: { url: string; name: string }[] = cred.additional_documents ?? []
  const next = current.filter(d => d.url !== url)

  // Quitar del storage (deriva el path desde la URL pública)
  const marker = '/contracts/'
  const idx = url.indexOf(marker)
  if (idx >= 0) {
    const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
    await db.storage.from('contracts').remove([path])
  }

  const { error } = await db.from('faculty_credentials').update({ additional_documents: next, updated_at: new Date().toISOString() }).eq('id', cred.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ additional_documents: next })
}
