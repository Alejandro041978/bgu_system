import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { completarCobertura } from '@/lib/curricular-plan'

export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Red de seguridad diaria: completa el registro de cualquier matriculado al que
// le falten asignaturas de su malla.
//
// Los gatillos (matrícula, activación, asignatura nueva, convalidación borrada)
// cubren los caminos conocidos. Éste cubre los que no conocemos: una carga
// masiva, una malla que se arma después, un gatillo que falló sin ruido. Corre
// antes que el de egresados, para que ese cuente sobre un registro completo.
async function run() {
  const r = await completarCobertura(db(), m => !m.exenta)
  return { ok: !r.error, ...r }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await run())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
