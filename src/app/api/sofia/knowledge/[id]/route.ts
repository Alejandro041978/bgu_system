import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { reindexArticle } from '../route'

export const maxDuration = 60

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// GET — un artículo completo (con contenido) para editar
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params

  const { data, error } = await (db() as any)
    .from('sofia_knowledge')
    .select('id, title, content, category, enabled, chunk_count, updated_at')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ article: data })
}

// PUT — actualizar artículo (+ reindexar si cambió el contenido)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params

  try {
    const { title, content, category, enabled } = await req.json() as {
      title?: string; content?: string; category?: string; enabled?: boolean
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (title !== undefined) update.title = title.trim()
    if (category !== undefined) update.category = category
    if (enabled !== undefined) update.enabled = enabled
    if (content !== undefined) update.content = content

    const { error } = await (db() as any).from('sofia_knowledge').update(update).eq('id', id)
    if (error) throw new Error(error.message)

    // Solo reindexamos (llamada costosa a embeddings) si cambió el contenido
    let chunks: number | undefined
    if (content !== undefined && content.trim()) {
      chunks = await reindexArticle(id, content)
    }

    return NextResponse.json({ ok: true, chunks })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE — borra artículo (los chunks caen por ON DELETE CASCADE)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params

  const { error } = await (db() as any).from('sofia_knowledge').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
