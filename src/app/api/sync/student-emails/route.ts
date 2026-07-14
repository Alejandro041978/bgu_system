import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST (desde N8N, Bearer CRON_SECRET) con [{ email, email_alt }]:
// carga el 2º correo (institucional) casando por el correo personal ya guardado.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!Array.isArray(body)) return NextResponse.json({ error: 'Se espera un arreglo [{email, email_alt}]' }, { status: 400 })

  const sb = db()

  // Mapa correo personal → id (paginado)
  const idByEmail = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('academic_students').select('id, email').not('email', 'is', null).range(from, from + 999)
    const rows = data ?? []
    for (const r of rows as { id: string; email: string }[]) idByEmail.set(r.email.toLowerCase().trim(), r.id)
    if (rows.length < 1000) break
  }

  // Resolver actualizaciones
  const updates: { id: string; email_alt: string }[] = []
  for (const rec of body as { email?: string; email_alt?: string }[]) {
    const key = rec.email?.toLowerCase().trim()
    const alt = rec.email_alt?.trim()
    if (!key || !alt) continue
    const id = idByEmail.get(key)
    if (id) updates.push({ id, email_alt: alt })
  }

  // Aplicar en lotes con concurrencia limitada
  let updated = 0
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50)
    await Promise.all(chunk.map(u => sb.from('academic_students').update({ email_alt: u.email_alt }).eq('id', u.id)))
    updated += chunk.length
  }

  return NextResponse.json({ received: body.length, matched: updates.length, updated })
}
