import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST (multipart) → sube el JPG de ejemplo y devuelve su URL pública.
export async function POST(req: NextRequest) {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const fileName = `document-samples/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const sb = admin()
  const { error } = await sb.storage.from('contracts').upload(fileName, buffer, { contentType: file.type, upsert: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = sb.storage.from('contracts').getPublicUrl(fileName)
  return NextResponse.json({ url: data.publicUrl })
}
