import { createClient } from '@supabase/supabase-js'
import { validateIsicPhoto, ISIC_PHOTO_MAX_BYTES } from './image-dimensions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const ISIC_PHOTO_BUCKET = 'isic-photos'

export interface SavePhotoResult {
  ok: boolean; error?: string; code?: number
  path?: string; previewUrl?: string | null; width?: number; height?: number
}

// Valida la foto contra los requisitos de ISIC y la guarda en el bucket privado.
//
// Vive aquí y no en una ruta porque hay dos puertas de entrada: el estudiante
// desde su portal, y Registros creando la solicitud por él (quien se acerca en
// persona y trae la foto). La validación tiene que ser la MISMA por las dos: si
// no cumple, CCDB la aceptaría igual —probado: acepta 300×300 con 200— y el
// estudiante se quedaría con un carné que le rechazan al presentarlo.
export async function saveIsicPhoto(studentId: string, file: File): Promise<SavePhotoResult> {
  if (file.size > ISIC_PHOTO_MAX_BYTES) {
    return { ok: false, code: 400, error: `La foto pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es 5 MB.` }
  }
  // El endpoint de fotos de CCDB solo admite estos dos content-type.
  const mime = file.type === 'image/png' ? 'image/png' : file.type === 'image/jpeg' ? 'image/jpeg' : null
  if (!mime) return { ok: false, code: 400, error: 'La foto debe ser JPG o PNG.' }

  const buf = Buffer.from(await file.arrayBuffer())
  const v = validateIsicPhoto(buf, file.size)
  if (!v.ok) return { ok: false, code: 400, error: v.error, width: v.info?.width, height: v.info?.height }

  const sb = db()
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  const path = `${studentId}/${Date.now()}.${ext}`
  const { error: upErr } = await sb.storage.from(ISIC_PHOTO_BUCKET).upload(path, buf, { contentType: mime, upsert: false })
  if (upErr) return { ok: false, code: 500, error: 'No se pudo guardar la foto: ' + upErr.message }

  // Firmada y corta: solo para que quien la subió vea lo que subió.
  const { data: signed } = await sb.storage.from(ISIC_PHOTO_BUCKET).createSignedUrl(path, 600)
  return { ok: true, path, previewUrl: signed?.signedUrl ?? null, width: v.info?.width, height: v.info?.height }
}
