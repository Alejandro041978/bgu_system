import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST multipart: id, kind ('scan' = documentos escaneados | 'cargo' = prueba
// de entrega), file → bucket privado degree-files; fija fecha y responsable.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const id = form?.get('id')?.toString()
  const kind = form?.get('kind')?.toString()
  const file = form?.get('file') as File | null
  if (!id || !file || !['scan', 'cargo'].includes(kind ?? '')) {
    return NextResponse.json({ error: 'Faltan id, kind (scan|cargo) y file' }, { status: 400 })
  }
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'Archivo mayor a 25 MB' }, { status: 400 })

  const sb = db()
  const { data: r } = await sb.from('degree_files').select('id, doc_code').eq('id', id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Expediente no encontrado' }, { status: 404 })

  const safe = file.name.replace(/[^\w.\-() ]+/g, '_').slice(0, 100)
  const path = `${id}/${kind}-${Date.now()}-${safe}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await sb.storage.from('degree-files')
    .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const now = new Date().toISOString()
  const who = user.email ?? user.id
  const patch = kind === 'scan'
    ? { scans_url: path, scans_uploaded_at: now, scans_uploaded_by: who, updated_at: now }
    : { delivery_proof_url: path, updated_at: now }
  const { error } = await sb.from('degree_files').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, path })
}
