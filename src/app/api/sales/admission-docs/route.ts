import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET ?convocatoria= → postulantes de la convocatoria + tipos + documentos
// subidos (con URL firmada 1h para ver/descargar)
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const convocatoriaId = req.nextUrl.searchParams.get('convocatoria')

  const [{ data: convocatorias }, { data: types }] = await Promise.all([
    sb.from('convocatorias').select('id, name').order('name'),
    sb.from('admission_doc_types').select('*').order('sort_order'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let students: any[] = []
  if (convocatoriaId) {
    const { data: enrs } = await sb.from('academic_student_enrollments')
      .select('id, enrollment_date, student:academic_students(first_name, last_name, second_last_name, document_number), program:academic_programs(name)')
      .eq('convocatoria_id', convocatoriaId).order('enrollment_date')
    const ids = (enrs ?? []).map((e: { id: string }) => e.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docsByEnr = new Map<string, any[]>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('admission_documents').select('*').in('enrollment_id', ids.slice(i, i + 200))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const d of (data ?? []) as any[]) {
        if (!docsByEnr.has(d.enrollment_id)) docsByEnr.set(d.enrollment_id, [])
        docsByEnr.get(d.enrollment_id)!.push(d)
      }
    }
    // URLs firmadas en lote
    const allDocs = [...docsByEnr.values()].flat()
    const signed = new Map<string, string>()
    for (let i = 0; i < allDocs.length; i += 50) {
      await Promise.all(allDocs.slice(i, i + 50).map(async d => {
        const { data: s } = await sb.storage.from('admission-docs').createSignedUrl(d.file_path, 3600)
        if (s?.signedUrl) signed.set(d.id, s.signedUrl)
      }))
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    students = (enrs ?? []).map((e: any) => ({
      enrollment_id: e.id,
      student_name: [e.student?.first_name, e.student?.last_name, e.student?.second_last_name].filter(Boolean).join(' '),
      document_number: e.student?.document_number ?? null,
      program_name: e.program?.name ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      docs: (docsByEnr.get(e.id) ?? []).map((d: any) => ({
        id: d.id, doc_type_id: d.doc_type_id, file_name: d.file_name, uploaded_at: d.uploaded_at,
        uploaded_by: d.uploaded_by, url: signed.get(d.id) ?? null,
      })),
    }))
  }

  return NextResponse.json({ convocatorias: convocatorias ?? [], types: types ?? [], students })
}

// POST multipart: enrollment_id, doc_type_id, file → sube (o REEMPLAZA) el
// documento de ese tipo para ese postulante
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  const enrollmentId = form?.get('enrollment_id')?.toString()
  const docTypeId = form?.get('doc_type_id')?.toString()
  const file = form?.get('file') as File | null
  if (!enrollmentId || !docTypeId || !file) return NextResponse.json({ error: 'Faltan enrollment_id, doc_type_id y file' }, { status: 400 })
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'Archivo mayor a 25 MB' }, { status: 400 })

  const sb = db()
  const safe = file.name.replace(/[^\w.\-() ]+/g, '_').slice(0, 100)
  const path = `${enrollmentId}/${docTypeId}-${Date.now()}-${safe}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await sb.storage.from('admission-docs')
    .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Reemplazo: borra el archivo anterior del mismo tipo si existía
  const { data: prev } = await sb.from('admission_documents')
    .select('file_path').eq('enrollment_id', enrollmentId).eq('doc_type_id', docTypeId).maybeSingle()
  if (prev?.file_path && prev.file_path !== path) {
    await sb.storage.from('admission-docs').remove([prev.file_path]).catch(() => {})
  }

  const { error } = await sb.from('admission_documents').upsert({
    enrollment_id: enrollmentId, doc_type_id: docTypeId,
    file_path: path, file_name: file.name,
    uploaded_at: new Date().toISOString(), uploaded_by: user.email ?? user.id,
  }, { onConflict: 'enrollment_id,doc_type_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= → quita un documento subido (y su archivo)
export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const sb = db()
  const { data: d } = await sb.from('admission_documents').select('file_path').eq('id', id).maybeSingle()
  if (!d) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  await sb.storage.from('admission-docs').remove([d.file_path]).catch(() => {})
  const { error } = await sb.from('admission_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH { id, name } → renombra un tipo de documento (los 6 son configurables)
export async function PATCH(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b?.id || !b?.name?.trim()) return NextResponse.json({ error: 'Faltan id y name' }, { status: 400 })
  const { error } = await db().from('admission_doc_types').update({ name: b.name.trim() }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
