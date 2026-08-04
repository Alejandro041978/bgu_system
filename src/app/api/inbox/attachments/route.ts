import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { INBOX_BUCKET } from '@/lib/gmail-helpdesk'
import { guardStaff } from '@/lib/api-guard'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// WhatsApp rechaza documentos por encima de 16 MB y Gmail por encima de 25.
// Se corta en 15 para que el mismo archivo sirva por los dos canales sin que
// el agente tenga que saber por cuál va a salir.
const MAX_BYTES = 15 * 1024 * 1024

// ---------------------------------------------------------------------------
// Sube un archivo para adjuntarlo a una respuesta del buzón.
//
// Se guarda antes de enviar, en el mismo bucket donde ya viven los adjuntos que
// llegan. Así el agente puede elegir varios, revisarlos y recién entonces
// mandar; y si el envío falla, el archivo no se pierde.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const conversationId = String(form?.get('conversation_id') ?? '')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  if (!conversationId) return NextResponse.json({ error: 'Falta la conversación' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `El archivo pesa ${(file.size / 1048576).toFixed(1)} MB y el máximo son 15 MB` }, { status: 400 })
  }
  if (!file.size) return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })

  const sb = db()
  // Nombre saneado: el original se conserva para mostrarlo y enviarlo, pero la
  // ruta en Storage no puede llevar acentos ni barras.
  const limpio = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80)
  const path = `${conversationId}/out/${crypto.randomUUID()}-${limpio}`

  const buf = Buffer.from(await file.arrayBuffer())
  const { error } = await sb.storage.from(INBOX_BUCKET)
    .upload(path, buf, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (error) return NextResponse.json({ error: `No se pudo guardar: ${error.message}` }, { status: 500 })

  return NextResponse.json({
    storage_path: path,
    filename: file.name,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
  })
}
