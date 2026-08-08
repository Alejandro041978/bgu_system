import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardStaff } from '@/lib/api-guard'
import { completarCobertura } from '@/lib/curricular-plan'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const noAutorizado = await guardStaff()
  if (noAutorizado) return noAutorizado

  const body = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db() as any)
    .from('academic_courses')
    .insert({
      program_id: body.program_id,
      name: body.name,
      code: body.code || null,
      credits: body.credits || 3,
      hours: body.hours ?? null,
      level: body.level || null,
    })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // La asignatura nueva entra al registro de quienes ya están matriculados en
  // el programa. Si no, cada vez que se amplía una malla nacen tantos registros
  // incompletos como estudiantes tenga —y nadie se entera hasta que alguien
  // cuenta las asignaturas de una ficha.
  let alcanzados = 0
  try {
    const r = await completarCobertura(db(), m => m.program_id === body.program_id)
    alcanzados = r.matriculas
  } catch (e) { console.error('registro de asignatura nueva', e) }
  return NextResponse.json({ ...data, registros_completados: alcanzados })
}
