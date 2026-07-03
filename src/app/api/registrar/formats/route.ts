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
  if (!Array.isArray(raw)) {
    return NextResponse.json([])
  }

  const templates = raw.map(t => {
    const bgElement = Array.isArray(t.elements)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? t.elements.find((el: any) => el.type === 'background')
      : null
    return {
      id: t.id as number,
      name: t.name as string,
      format: (t.format ?? 'Letter') as string,
      is_portrait: !!t.is_portrait,
      use_two_side: !!t.use_two_side,
      created_at: t.created_at as string,
      updated_at: t.updated_at as string,
      preview_url: (bgElement?.content as string | undefined) ?? null,
      simplecert_url: `https://app.simplecert.net/build/${t.id}`,
    }
  })

  return NextResponse.json(templates)
}
