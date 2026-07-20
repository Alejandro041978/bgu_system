import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// GET → ficha completa del estudiante + matrículas
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sb = db()
  const { data: s } = await sb.from('academic_students').select('*').eq('id', id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  const { data: enr } = await sb.from('academic_student_enrollments')
    .select('id, enrollment_date, academic_programs(name), convocatorias(name)')
    .eq('student_id', id)

  return NextResponse.json({
    student: s,
    enrollments: ((enr ?? []) as { id: string; enrollment_date: string | null; academic_programs: { name: string } | null; convocatorias: { name: string } | null }[])
      .map(e => ({
        id: e.id,
        program: e.academic_programs?.name ?? '(sin programa)',
        convocatoria: e.convocatorias?.name ?? null,
        fecha: e.enrollment_date,
      })),
  })
}

// Campos editables de la ficha; todo lo demás (external_id, source, moodle,
// retiros) lo gobiernan el sync y los motores.
const EDITABLE = ['first_name', 'last_name', 'second_last_name', 'document_type', 'document_number',
  'email', 'email_alt', 'phone_code', 'phone_local', 'date_of_birth', 'city', 'country', 'situation'] as const

// PATCH → edita la ficha. Cambiar la situación la marca como manual (los
// motores de egreso/retiro no la pisan); ?situacion_auto=1 la devuelve a auto.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => null)
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  const sb = db()

  const { data: curr } = await sb.from('academic_students').select('*').eq('id', id).maybeSingle()
  if (!curr) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  if (b.situacion_auto) {
    const { error } = await sb.from('academic_students').update({ situation_source: 'auto' }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {}
  for (const k of EDITABLE) {
    if (!(k in b)) continue
    const v = typeof b[k] === 'string' ? b[k].trim() : b[k]
    patch[k] = v === '' ? null : v
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })

  if (patch.first_name === null || patch.last_name === null) {
    return NextResponse.json({ error: 'Nombres y primer apellido no pueden quedar vacíos' }, { status: 400 })
  }
  if (patch.country) {
    patch.country = String(patch.country).toUpperCase()
    if (!/^[A-Z]{3}$/.test(patch.country)) {
      return NextResponse.json({ error: 'El país debe ser un código ISO de 3 letras' }, { status: 400 })
    }
  }
  if ('document_number' in patch) {
    if (patch.document_number === null) return NextResponse.json({ error: 'El documento no puede quedar vacío' }, { status: 400 })
    const { data: dup } = await sb.from('academic_students')
      .select('id').eq('document_number', patch.document_number).neq('id', id).limit(1)
    if ((dup ?? []).length) return NextResponse.json({ error: 'Otro estudiante ya tiene ese documento' }, { status: 409 })
  }
  // Teléfono: phone_number canónico E.164 se recompone de código + número
  if ('phone_code' in patch || 'phone_local' in patch) {
    const code = ('phone_code' in patch ? patch.phone_code : curr.phone_code) as string | null
    let local = ('phone_local' in patch ? patch.phone_local : curr.phone_local) as string | null
    if (code && !/^\+\d{1,3}$/.test(code)) {
      return NextResponse.json({ error: 'El código telefónico debe tener el formato +51' }, { status: 400 })
    }
    if (local) {
      local = local.replace(/\D/g, '')
      if (local.length < 6 || local.length > 12) {
        return NextResponse.json({ error: 'El número telefónico debe tener entre 6 y 12 dígitos' }, { status: 400 })
      }
      patch.phone_local = local
    }
    patch.phone_number = code && local ? `${code}${local}` : (local || null)
  }
  // Situación editada a mano → deja de ser automática
  if ('situation' in patch && patch.situation !== curr.situation) {
    patch.situation_source = 'manual'
  }

  const { error } = await sb.from('academic_students').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
