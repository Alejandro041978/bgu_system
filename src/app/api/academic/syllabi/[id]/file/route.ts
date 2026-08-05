import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { SYLLABI_BUCKET } from '@/lib/syllabi'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET → URL firmada temporal del PDF. El bucket es privado: nunca se devuelve
// una URL eterna, que sobreviviría a cualquier cambio de permisos.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const { id } = await params
  const sb = db()
  const { data: s } = await sb.from('course_syllabi').select('file_path, file_name').eq('id', id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Sílabo no encontrado' }, { status: 404 })

  const { data, error } = await sb.storage.from(SYLLABI_BUCKET).createSignedUrl(s.file_path, 300)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'No se pudo abrir el archivo: ' + (error?.message ?? 'sin URL') }, { status: 500 })
  }
  return NextResponse.json({ url: data.signedUrl, file_name: s.file_name })
}
