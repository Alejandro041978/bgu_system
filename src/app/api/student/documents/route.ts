import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveStudent } from '@/lib/student-identity'
import { createDocumentRequest } from '@/lib/document-request'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Resuelve el academic_students.id del estudiante efectivo (por email o documento).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveStudentId(sb: any, ident: { email: string | null; document_number: string | null }): Promise<string | null> {
  if (ident.email) {
    const { data } = await sb.from('academic_students').select('id').eq('email', ident.email).eq('disabled', false).maybeSingle()
    if (data?.id) return data.id
  }
  if (ident.document_number) {
    const { data } = await sb.from('academic_students').select('id').eq('document_number', ident.document_number).maybeSingle()
    if (data?.id) return data.id
  }
  return null
}

export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'Sin estudiante' }, { status: 403 })

  const sb = db()
  const studentId = await resolveStudentId(sb, ident)
  if (!studentId) return NextResponse.json({ requests: [], programs: [], types: [] })

  // Programas matriculados
  const { data: enr } = await sb.from('academic_student_enrollments').select('program_id').eq('student_id', studentId)
  const programIds = [...new Set((enr ?? []).map((e: { program_id: string }) => e.program_id).filter(Boolean))]
  const { data: programs } = programIds.length
    ? await sb.from('academic_programs').select('id, name, category_id').in('id', programIds).order('name')
    : { data: [] }

  // Tipos activos (con alcance para filtrar en el cliente)
  const { data: types } = await sb.from('document_types')
    .select('id, name, price, currency, active, scope_category_id, scope_category_ids, scope_program_ids, sample_image_url, request_note_label').eq('active', true).order('name')

  // Solicitudes del estudiante
  const { data: reqs } = await sb.from('document_requests')
    .select('id, status, paid, requested_at, document_url, type:document_types(name, price, currency)')
    .eq('student_id', studentId).order('requested_at', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requests = (reqs ?? []).map((r: any) => ({
    id: r.id, status: r.status, paid: r.paid, requested_at: r.requested_at, document_url: r.document_url,
    type_name: r.type?.name ?? '—', price: r.type?.price ?? 0, currency: r.type?.currency ?? 'USD',
  }))

  return NextResponse.json({ requests, programs: programs ?? [], types: types ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return NextResponse.json({ error: 'Sin estudiante' }, { status: 403 })

  const sb = db()
  const studentId = await resolveStudentId(sb, ident)
  if (!studentId) return NextResponse.json({ error: 'No se encontró tu registro de estudiante' }, { status: 404 })

  const b = await req.json().catch(() => null)
  if (!b?.document_type_id) return NextResponse.json({ error: 'Falta el tipo de documento' }, { status: 400 })

  const res = await createDocumentRequest({
    studentId, documentTypeId: b.document_type_id, programId: b.program_id || null, requestedBy: 'student',
    requestNote: b.request_note ?? null,
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.code ?? 500 })
  return NextResponse.json({ ok: true, id: res.id, status: res.status, checks: res.checks, blocked: res.blocked, document_url: res.document_url })
}
