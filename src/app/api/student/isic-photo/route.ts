import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveStudent } from '@/lib/student-identity'
import { validateIsicPhoto, ISIC_PHOTO_MAX_BYTES } from '@/lib/image-dimensions'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const BUCKET = 'isic-photos'

// POST multipart { file } → valida la foto contra los requisitos de ISIC y la
// guarda en el bucket privado. Devuelve la ruta, que viaja luego en la creación
// de la solicitud.
//
// La validación se repite aquí aunque el navegador ya la haya hecho: la del
// cliente es comodidad (avisa al instante), esta es la que manda. Si la foto no
// cumple, CCDB la rechazaría con 400 después de haber consumido una licencia.
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
  if (file.size > ISIC_PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: `La foto pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es 5 MB.` }, { status: 400 })
  }
  // El endpoint de fotos de CCDB solo admite estos dos content-type.
  const mime = file.type === 'image/png' ? 'image/png' : file.type === 'image/jpeg' ? 'image/jpeg' : null
  if (!mime) return NextResponse.json({ error: 'La foto debe ser JPG o PNG.' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const v = validateIsicPhoto(buf, file.size)
  if (!v.ok) return NextResponse.json({ error: v.error, width: v.info?.width, height: v.info?.height }, { status: 400 })

  const ext = mime === 'image/png' ? 'png' : 'jpg'
  const path = `${studentId}/${Date.now()}.${ext}`
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false })
  if (upErr) return NextResponse.json({ error: 'No se pudo guardar la foto: ' + upErr.message }, { status: 500 })

  // La URL firmada es solo para que el estudiante vea lo que subió.
  const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 600)
  return NextResponse.json({
    ok: true, path, preview_url: signed?.signedUrl ?? null,
    width: v.info?.width, height: v.info?.height,
  })
}
