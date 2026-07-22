import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { marcarTitulado } from '@/lib/titulacion'
import { gmailHelpdeskConfigured, sendGmailReply } from '@/lib/gmail-helpdesk'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// Checks de etapa permitidos (cada uno guarda *_at + *_by automáticamente)
const CHECKS = ['simplecert_ok', 'sent_florida', 'printed', 'notarized', 'apostille_started', 'courier_sent', 'delivered'] as const
// Campos editables de texto
const FIELDS = ['receiver_name', 'receiver_phone', 'receiver_address', 'receiver_references', 'receiver_city', 'receiver_postal', 'receiver_country', 'courier_tracking', 'notes', 'tramite_group', 'doc_code'] as const

// GET → hoja de control (expedientes con su estudiante y programa)
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sb = db()
  const status = req.nextUrl.searchParams.get('status')
  const group = req.nextUrl.searchParams.get('group')

  let q = sb.from('degree_files')
    .select('*, student:academic_students(first_name, last_name, second_last_name, document_number, email, email_alt, phone_number, city, country), program:academic_programs(name)')
    .order('doc_code', { ascending: true }).limit(1000)
  if (status) q = q.eq('status', status)
  if (group) q = q.eq('tramite_group', group)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Falta correr supabase/degree_files.sql: ' + error.message }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).map(r => ({
    ...r,
    student_name: [r.student?.first_name, r.student?.last_name, r.student?.second_last_name].filter(Boolean).join(' '),
    document: r.student?.document_number ? String(r.student.document_number) : '',
    student_email: r.student?.email_alt ?? r.student?.email ?? null,
    program_name: r.program?.name ?? null,
  }))
  const groups = [...new Set(rows.map(r => r.tramite_group).filter(Boolean))].sort()
  return NextResponse.json({ rows, groups })
}

// POST { student_id, program_id, includes_apostille?, document_request_id? }
// → crea el expediente con código correlativo y datos de entrega precargados
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as {
    student_id?: string; program_id?: string; includes_apostille?: boolean; document_request_id?: string
  } | null
  if (!b?.student_id) return NextResponse.json({ error: 'Falta student_id' }, { status: 400 })

  const sb = db()
  const { data: stu } = await sb.from('academic_students')
    .select('first_name, last_name, second_last_name, phone_number, city, country').eq('id', b.student_id).maybeSingle()
  if (!stu) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 })

  // Código correlativo: continúa la numeración del Excel (000001…)
  const { data: last } = await sb.from('degree_files')
    .select('doc_code').not('doc_code', 'is', null).order('doc_code', { ascending: false }).limit(1).maybeSingle()
  const next = String((Number(last?.doc_code ?? 0) || 0) + 1).padStart(6, '0')

  const { data, error } = await sb.from('degree_files').insert({
    student_id: b.student_id,
    program_id: b.program_id ?? null,
    document_request_id: b.document_request_id ?? null,
    includes_apostille: b.includes_apostille ?? true,
    doc_code: next,
    receiver_name: [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' '),
    receiver_phone: stu.phone_number ?? null,
    receiver_city: stu.city ?? null,
    receiver_country: stu.country ?? null,
  }).select('id, doc_code').single()
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return NextResponse.json({ error: 'Ya existe un expediente para ese estudiante y programa' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: data.id, doc_code: data.doc_code })
}

// PATCH { id, check?: {name, value}, fields?: {...}, includes_apostille?, action?: 'send_digital' }
export async function PATCH(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null) as {
    id?: string
    check?: { name: string; value: boolean }
    fields?: Record<string, string | null>
    includes_apostille?: boolean
    action?: string
  } | null
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const sb = db()
  const { data: r } = await sb.from('degree_files')
    .select('*, student:academic_students(first_name, email, email_alt), program:academic_programs(name)')
    .eq('id', b.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Expediente no encontrado' }, { status: 404 })
  const now = new Date().toISOString()
  const who = user.email ?? user.id
  const patch: Record<string, unknown> = { updated_at: now }

  if (b.check) {
    if (!(CHECKS as readonly string[]).includes(b.check.name)) return NextResponse.json({ error: 'Check no válido' }, { status: 400 })
    patch[`${b.check.name}_at`] = b.check.value ? now : null
    patch[`${b.check.name}_by`] = b.check.value ? who : null
    if (b.check.name === 'delivered') patch.status = b.check.value ? 'entregado' : 'en_proceso'
    // La conformidad del documento emitido confirma la titulación (idempotente)
    if (b.check.name === 'simplecert_ok' && b.check.value) {
      await marcarTitulado(r.student_id, r.program_id ?? null, { source: 'emision' }).catch(() => null)
    }
  }

  if (b.fields) {
    for (const [k, v] of Object.entries(b.fields)) {
      if ((FIELDS as readonly string[]).includes(k)) patch[k] = typeof v === 'string' ? (v.trim() || null) : v
    }
  }
  if (b.includes_apostille !== undefined) patch.includes_apostille = b.includes_apostille

  // Envío digital al graduado: correo con el link firmado de los escaneos
  if (b.action === 'send_digital') {
    if (!r.scans_url) return NextResponse.json({ error: 'Primero sube los escaneos' }, { status: 400 })
    const to = r.student?.email_alt ?? r.student?.email
    if (!to) return NextResponse.json({ error: 'El estudiante no tiene correo' }, { status: 400 })
    if (!gmailHelpdeskConfigured()) return NextResponse.json({ error: 'Gmail de helpdesk sin configurar' }, { status: 503 })
    const { data: signed } = await sb.storage.from('degree-files').createSignedUrl(r.scans_url, 60 * 60 * 24 * 7)
    if (!signed?.signedUrl) return NextResponse.json({ error: 'No se pudo firmar el enlace de los escaneos' }, { status: 500 })
    await sendGmailReply({
      to,
      subject: `Tus documentos de titulación en digital — ${r.program?.name ?? 'Blackwell Global University'}`,
      text: `Hola ${r.student?.first_name ?? ''},\n\n¡Felicitaciones! Te compartimos la versión digital de tus documentos de titulación (expediente ${r.doc_code}).\n\nDescárgalos aquí (enlace válido por 7 días):\n${signed.signedUrl}\n\nLos documentos físicos siguen su proceso de envío; te avisaremos con el número de guía.\n\nRegistrar's Office · Blackwell Global University`,
    })
    patch.digital_sent_at = now
    patch.digital_sent_by = who
  }

  const { error } = await sb.from('degree_files').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
