import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { saveIsicPhoto } from '@/lib/isic-photo'

export const revalidate = 0

// POST multipart { file, student_id } → la foto de un estudiante, subida por
// Registros cuando crea la solicitud por él (el que se acerca en persona con su
// foto en un USB o la manda por correo).
//
// El student_id viene en el cuerpo, así que la puerta tiene que estar cerrada de
// verdad: los estudiantes tienen sesión de Supabase, y sin este rechazo
// cualquiera podría subir una foto a nombre de otro.
export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const studentId = String(form?.get('student_id') ?? '').trim()
  if (!studentId) return NextResponse.json({ error: 'Falta el estudiante' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta la foto' }, { status: 400 })

  const res = await saveIsicPhoto(studentId, file)
  if (!res.ok) return NextResponse.json({ error: res.error, width: res.width, height: res.height }, { status: res.code ?? 400 })
  return NextResponse.json({ ok: true, path: res.path, preview_url: res.previewUrl, width: res.width, height: res.height })
}
