import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { advanceCarousels } from '@/lib/carousel'

export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Red de seguridad diaria del motor de carruseles: el avance normal ocurre al
// cerrar una nota (grades-write), pero este cron garantiza convergencia si
// algo se escribió por otra vía (sync de N8N, SQL directo) o si Moodle falló.
// GET ?dry=1 → simulación sin escribir (para revisar antes de una colocación).
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'
  try {
    return NextResponse.json(await advanceCarousels(db(), { dryRun }))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
