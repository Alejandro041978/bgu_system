import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { isStudentUser } from '@/lib/student-identity'
import { signStorageUrl, parseStorageUrl } from '@/lib/storage-url'

export const revalidate = 0

// GET ?u=<url guardada> → redirige a una URL FIRMADA temporal (5 min).
// Puerta de acceso a los documentos del bucket privado: exige sesión de STAFF.
// Los documentos que maneja (contratos, credenciales docentes, informes) son
// internos; el portal del estudiante usa SimpleCert, que no pasa por aquí.
export async function GET(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (await isStudentUser(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const u = req.nextUrl.searchParams.get('u')
  if (!u) return NextResponse.json({ error: 'Falta u' }, { status: 400 })
  // Solo se firman objetos de NUESTRO Storage: evita usar esta ruta como proxy
  // abierto hacia cualquier dirección de internet.
  if (!parseStorageUrl(u)) return NextResponse.json({ error: 'La dirección no corresponde a un documento del sistema' }, { status: 400 })

  const signed = await signStorageUrl(u, 300)
  if (!signed) return NextResponse.json({ error: 'No se pudo abrir el documento' }, { status: 404 })
  return NextResponse.redirect(signed)
}
