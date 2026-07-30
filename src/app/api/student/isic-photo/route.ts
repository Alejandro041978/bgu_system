import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveStudent } from '@/lib/student-identity'
import { saveIsicPhoto } from '@/lib/isic-photo'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// POST multipart { file } → la foto del ESTUDIANTE LOGUEADO para su carné ISIC.
// El estudiante se resuelve de la sesión, nunca del cuerpo: nadie sube una foto
// a nombre de otro desde el portal.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'Sin estudiante' }, { status: 403 })

  const sb = db()
  let studentId: string | null = null
  if (ident.email) {
    const { data } = await sb.from('academic_students').select('id').eq('email', ident.email).eq('disabled', false).maybeSingle()
    studentId = data?.id ?? null
  }
  if (!studentId && ident.document_number) {
    const { data } = await sb.from('academic_students').select('id').eq('document_number', ident.document_number).maybeSingle()
    studentId = data?.id ?? null
  }
  if (!studentId) return NextResponse.json({ error: 'No se encontró tu registro de estudiante' }, { status: 404 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta la foto' }, { status: 400 })

  const res = await saveIsicPhoto(studentId, file)
  if (!res.ok) return NextResponse.json({ error: res.error, width: res.width, height: res.height }, { status: res.code ?? 400 })
  return NextResponse.json({ ok: true, path: res.path, preview_url: res.previewUrl, width: res.width, height: res.height })
}
