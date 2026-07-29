import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ---------------------------------------------------------------------------
// Documentos en Supabase Storage: el bucket es PRIVADO y el acceso se da con
// URLs FIRMADAS temporales, nunca con la URL pública eterna (auditoría
// 2026-07-29: el bucket `contracts` era público y cualquiera con el link
// descargaba el contrato sin autenticación).
//
// La base guarda URLs públicas históricas (185 filas). En vez de migrarlas, se
// extrae la ruta del objeto y se firma al vuelo: sirve para lo viejo y lo nuevo.
// ---------------------------------------------------------------------------

export interface StorageRef { bucket: string; path: string }

/** Extrae bucket+ruta de una URL de Storage (pública o firmada). null si es externa. */
export function parseStorageUrl(url: string | null | undefined): StorageRef | null {
  if (!url) return null
  const m = String(url).match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/)
  if (!m) return null
  return { bucket: m[1], path: decodeURIComponent(m[2]) }
}

/**
 * Devuelve una URL utilizable para leer el documento:
 *  - si apunta a nuestro Storage → URL FIRMADA con caducidad;
 *  - si es externa (p. ej. SimpleCert) → la misma URL, sin tocar.
 * Ante cualquier fallo devuelve la original: nunca deja al usuario sin enlace.
 */
export async function signStorageUrl(url: string | null | undefined, expiresInSeconds = 300): Promise<string | null> {
  if (!url) return null
  const ref = parseStorageUrl(url)
  if (!ref) return url
  try {
    const { data, error } = await admin().storage.from(ref.bucket).createSignedUrl(ref.path, expiresInSeconds)
    return error || !data?.signedUrl ? url : data.signedUrl
  } catch {
    return url
  }
}

/** Descarga el contenido de un documento (para IA/SignNow) sin exponerlo en la web. */
export async function downloadStorageFile(url: string | null | undefined): Promise<ArrayBuffer | null> {
  const ref = parseStorageUrl(url)
  if (!ref) {
    if (!url) return null
    const res = await fetch(url).catch(() => null)   // externo: se descarga normal
    return res?.ok ? await res.arrayBuffer() : null
  }
  const { data, error } = await admin().storage.from(ref.bucket).download(ref.path)
  if (error || !data) return null
  return await data.arrayBuffer()
}
