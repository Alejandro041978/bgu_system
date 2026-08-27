import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveStudent } from '@/lib/student-identity'
import { createTramiteRequest, programasQueCumplenSituacion } from '@/lib/tramites'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveStudent(sb: any, ident: { email: string | null; document_number: string | null }) {
  if (ident.email) {
    const { data } = await sb.from('academic_students').select('id').eq('email', ident.email).eq('disabled', false).maybeSingle()
    if (data) return data.id as string
  }
  if (ident.document_number) {
    const { data } = await sb.from('academic_students').select('id').eq('document_number', ident.document_number).maybeSingle()
    if (data) return data.id as string
  }
  return null
}

async function quienEs() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return { error: NextResponse.json({ error: 'Sin estudiante' }, { status: 403 }) }
  return { ident }
}

// GET → catálogo de trámites + los que ya pidió el estudiante
export async function GET() {
  const q = await quienEs()
  if (q.error) return q.error
  const sb = db()
  const studentId = await resolveStudent(sb, q.ident)
  if (!studentId) return NextResponse.json({ types: [], requests: [] })

  const { data: types } = await sb.from('tramite_types')
    .select('id, name, description, price, currency, request_note_label, instructions, requires_situation, requires_situation_note')
    .eq('active', true).order('name')

  // Su situación viaja al cliente para poder DECIRLE por qué un trámite no le
  // corresponde, en vez de dejarle un botón muerto o un error al confirmar.
  const { data: stu } = await sb.from('academic_students').select('situation').eq('id', studentId).maybeSingle()

  // La situación global es el agregado de todas las matrículas: un egresado
  // del MBA que cursa el doctorado figura "activo". Para cada requisito de
  // situación del catálogo se listan los programas donde el estudiante SÍ lo
  // cumple — la pantalla habilita el trámite y hace elegir el programa.
  const requisitos = [...new Set(((types ?? []) as { requires_situation: string | null }[])
    .map(t => t.requires_situation?.trim().toLowerCase()).filter(Boolean))] as string[]
  const programOptions: Record<string, { id: string; name: string }[]> = {}
  for (const req of requisitos) {
    programOptions[req] = await programasQueCumplenSituacion(sb, studentId, req)
  }

  const { data: reqs } = await sb.from('tramite_requests')
    .select('id, status, requested_at, paid_at, attended_at, resolution_note, request_note, type:tramite_types(name, price, currency)')
    .eq('student_id', studentId).order('requested_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requests = (reqs ?? []).map((r: any) => ({
    id: r.id, status: r.status, requested_at: r.requested_at, paid_at: r.paid_at,
    attended_at: r.attended_at, resolution_note: r.resolution_note, request_note: r.request_note,
    type_name: r.type?.name ?? '—', price: r.type?.price ?? 0, currency: r.type?.currency ?? 'USD',
  }))
  return NextResponse.json({ types: types ?? [], requests, situation: stu?.situation ?? null, program_options: programOptions })
}

// POST { tramite_type_id, request_note } → solicita el trámite y genera la cuota
export async function POST(req: NextRequest) {
  const q = await quienEs()
  if (q.error) return q.error
  const sb = db()
  const studentId = await resolveStudent(sb, q.ident)
  if (!studentId) return NextResponse.json({ error: 'No se encontró tu registro de estudiante' }, { status: 404 })

  const b = await req.json().catch(() => null) as { tramite_type_id?: string; request_note?: string; program_id?: string } | null
  if (!b?.tramite_type_id) return NextResponse.json({ error: 'Falta el trámite' }, { status: 400 })

  const res = await createTramiteRequest({
    studentId, tramiteTypeId: b.tramite_type_id, programId: b.program_id ?? null,
    requestNote: b.request_note ?? null, requestedBy: 'student',
  })
  if (!res.ok) return NextResponse.json({ error: res.error, opciones: res.opciones ?? undefined }, { status: res.code ?? 500 })
  return NextResponse.json({ ok: true, id: res.id, status: res.status, charge: res.charge })
}
