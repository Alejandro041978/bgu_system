import { NextResponse } from 'next/server'

const SIMPLECERT_BASE = 'https://app.simplecert.net/api'
const SIMPLECERT_ACCOUNT_ID = 25481

async function getSimpleCertSession(): Promise<string | null> {
  const res = await fetch(`${SIMPLECERT_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SIMPLECERT_EMAIL,
      password: process.env.SIMPLECERT_PASSWORD,
    }),
  })
  if (!res.ok) return null
  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/simplecert_session=([^;]+)/)
  return match ? match[1] : null
}

type RawElement = {
  type: string
  content?: string
  styles?: Record<string, string>
  hideSpan?: boolean
}

export async function GET() {
  const sessionToken = await getSimpleCertSession()
  if (!sessionToken) {
    return NextResponse.json({ error: 'No se pudo autenticar con SimpleCert' }, { status: 502 })
  }

  const res = await fetch(
    `${SIMPLECERT_BASE}/certificates?where=account_id,${SIMPLECERT_ACCOUNT_ID}`,
    { headers: { Cookie: `simplecert_session=${sessionToken}` } }
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Error al obtener formatos de SimpleCert' }, { status: 502 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = await res.json()
  if (!Array.isArray(raw)) return NextResponse.json([])

  const templates = raw.map(t => {
    const elements: RawElement[] = Array.isArray(t.elements) ? t.elements : []

    // Extract visual elements for client-side rendering
    const visualElements = elements
      .filter(el => ['background', 'image'].includes(el.type) && el.content)
      .map(el => ({
        type: el.type,
        content: el.content!,
        styles: el.styles ?? {},
      }))

    return {
      id: t.id as number,
      name: t.name as string,
      format: (t.format ?? 'Letter') as string,
      is_portrait: !!t.is_portrait,
      use_two_side: !!t.use_two_side,
      updated_at: t.updated_at as string,
      elements: visualElements,
      simplecert_url: `https://app.simplecert.net/build/${t.id}`,
    }
  })

  return NextResponse.json(templates)
}
