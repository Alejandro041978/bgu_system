import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAuth() {
  const authClient = await createAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// POST { documents: string[] } → aplica el esquema a todos los estudiantes de la lista,
// resolviendo por número de documento. Inserta en lotes (soporta cientos de estudiantes).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const { documents } = await req.json() as { documents?: string[] }
  if (!documents?.length) return NextResponse.json({ error: 'Sin documentos' }, { status: 400 })

  const docs = [...new Set(documents.map(d => String(d).trim()).filter(Boolean))]

  const sb = db()
  const { data: scheme } = await sb.from('transfer_schemes').select('*').eq('id', id).maybeSingle()
  if (!scheme) return NextResponse.json({ error: 'Esquema no encontrado' }, { status: 404 })
  const { data: schemeItems } = await sb.from('transfer_scheme_items').select('*').eq('scheme_id', id)
  if (!schemeItems?.length) return NextResponse.json({ error: 'El esquema no tiene asignaturas' }, { status: 400 })

  // Un estudiante por documento
  const { data: studentsRaw } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, document_number')
    .in('document_number', docs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byDoc = new Map<string, any>()
  for (const s of studentsRaw ?? []) if (s.document_number && !byDoc.has(s.document_number)) byDoc.set(s.document_number, s)

  const foundDocs = [...byDoc.keys()]
  const notFound = docs.filter(d => !byDoc.has(d))
  const studentIds = foundDocs.map(d => byDoc.get(d).id)

  // Ya aplicados a este esquema (no duplicar)
  let already = new Set<string>()
  if (studentIds.length) {
    const { data: existing } = await sb.from('transfer_credits').select('student_id').eq('scheme_id', id).in('student_id', studentIds)
    already = new Set((existing ?? []).map((e: { student_id: string }) => e.student_id))
  }
  const toApply = foundDocs.filter(d => !already.has(byDoc.get(d).id))

  if (toApply.length === 0) {
    return NextResponse.json({ applied: 0, skipped_existing: foundDocs.length, not_found: notFound.length, not_found_docs: notFound.slice(0, 50) })
  }

  // Cabeceras en lote
  const headerRows = toApply.map(d => {
    const s = byDoc.get(d)
    const name = [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(' ')
    return {
      student_id: s.id, student_document: s.document_number, student_name: name,
      origin_institution: scheme.origin_institution, dest_program_id: scheme.dest_program_id,
      scale_id: scheme.scale_id, scheme_id: scheme.id, created_by: user.id,
    }
  })
  const { data: created, error: hErr } = await sb.from('transfer_credits').insert(headerRows).select('id, student_id')
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 })

  // Ítems de cada cabecera (en lotes)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemRows: any[] = []
  for (const h of created ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of schemeItems as any[]) {
      itemRows.push({
        transfer_credit_id: h.id, origin_course_name: it.origin_course_name,
        origin_course_code: it.origin_course_code ?? null, origin_credits: it.origin_credits ?? null,
        dest_course_id: it.dest_course_id, dest_course_name: it.dest_course_name, origin_grade: null,
      })
    }
  }
  const chunk = 1000
  for (let i = 0; i < itemRows.length; i += chunk) {
    const { error } = await sb.from('transfer_credit_items').insert(itemRows.slice(i, i + chunk))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    applied: created?.length ?? 0,
    skipped_existing: foundDocs.length - toApply.length,
    not_found: notFound.length,
    not_found_docs: notFound.slice(0, 50),
  })
}
