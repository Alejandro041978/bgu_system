import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isStudentUser } from '@/lib/student-identity'
import { isicEnvironment, isicConfigured, isicGetProfile, xmlValue } from '@/lib/isic'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Los estudiantes tienen sesión de Supabase, así que "hay usuario" no alcanza:
// el inventario de licencias es gestión y se rechaza explícitamente.
async function requireStaff() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (await isStudentUser(user)) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  return { user }
}

// GET → inventario del entorno activo + últimas asignaciones.
export async function GET() {
  const g = await requireStaff()
  if (g.error) return g.error
  const sb = db()
  const environment = isicEnvironment()

  const cuenta = async (status: string) => {
    const { count } = await sb.from('isic_cards')
      .select('*', { count: 'exact', head: true }).eq('environment', environment).eq('status', status)
    return count ?? 0
  }
  const [available, assigned, voided] = await Promise.all([cuenta('available'), cuenta('assigned'), cuenta('voided')])

  const { data: asignadas } = await sb.from('isic_cards')
    .select('card_number, status, printed_name, valid_from, valid_to, isic_status, assigned_at, last_http_code, last_error, registration_url, ' +
      'profile_status, notified_at, email, ' +
      'student:academic_students(first_name, last_name, second_last_name, document_number)')
    .eq('environment', environment).not('assigned_at', 'is', null)
    .order('assigned_at', { ascending: false }).limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (asignadas ?? []).map((c: any) => ({
    card_number: c.card_number, status: c.status, printed_name: c.printed_name,
    valid_from: c.valid_from, valid_to: c.valid_to, isic_status: c.isic_status,
    assigned_at: c.assigned_at, last_http_code: c.last_http_code, last_error: c.last_error,
    registration_url: c.registration_url, profile_status: c.profile_status,
    notified_at: c.notified_at, email: c.email,
    student_name: [c.student?.first_name, c.student?.last_name, c.student?.second_last_name].filter(Boolean).join(' '),
    document_number: c.student?.document_number ?? null,
  }))

  const { data: eventos } = await sb.from('isic_events')
    .select('card_number, action, http_code, ok, response_body, created_at')
    .order('created_at', { ascending: false }).limit(30)

  return NextResponse.json({
    environment, configured: isicConfigured(),
    totals: { available, assigned, voided, total: available + assigned + voided },
    rows, eventos: eventos ?? [],
  })
}

// POST { numbers, environment } → importa un bloque de licencias.
// ISIC envía los números en un Excel; se pegan aquí (uno por línea, o separados
// por comas/espacios). La letra de control no es derivable del correlativo, así
// que los números se importan tal cual, nunca se generan.
export async function POST(req: NextRequest) {
  const g = await requireStaff()
  if (g.error) return g.error

  const b = await req.json().catch(() => null) as { numbers?: string; environment?: string } | null
  const environment = b?.environment === 'production' ? 'production' : 'staging'
  const crudos = String(b?.numbers ?? '').split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
  if (!crudos.length) return NextResponse.json({ error: 'Pega al menos un número de carné' }, { status: 400 })

  // Formato ISIC: letra + 12 dígitos + letra de control (S034500092211K).
  const validos = crudos.filter(n => /^[A-Z]\d{12}[A-Z0-9]$/.test(n))
  const invalidos = crudos.filter(n => !/^[A-Z]\d{12}[A-Z0-9]$/.test(n))
  const unicos = [...new Set(validos)]
  if (!unicos.length) {
    return NextResponse.json({ error: 'Ningún número tiene el formato de ISIC (letra + 12 dígitos + carácter de control)', invalidos }, { status: 400 })
  }

  const sb = db()
  // Una licencia ya asignada NO se toca: reimportar el bloque no puede
  // devolver al inventario un número que ya está en el carné de alguien.
  const { data: existentes } = await sb.from('isic_cards')
    .select('card_number, status').in('card_number', unicos)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yaEstan = new Set((existentes ?? []).map((c: any) => c.card_number))
  const nuevos = unicos.filter(n => !yaEstan.has(n))

  if (nuevos.length) {
    const { error } = await sb.from('isic_cards')
      .insert(nuevos.map(card_number => ({ card_number, environment, status: 'available' })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true, importadas: nuevos.length, ya_existian: yaEstan.size,
    invalidos, environment,
  })
}

// PATCH { card_number, action }
//   profile → consulta a ISIC el enlace de alta y SI EL ESTUDIANTE YA ACTIVÓ el
//             carné en la app. Emitir no es activar: el carné digital solo llega
//             a sus manos cuando abre el enlace con la app instalada.
//   notify  → reenvía el correo con las instrucciones de activación.
export async function PATCH(req: NextRequest) {
  const g = await requireStaff()
  if (g.error) return g.error

  const b = await req.json().catch(() => null) as { card_number?: string; action?: string } | null
  if (!b?.card_number) return NextResponse.json({ error: 'Falta card_number' }, { status: 400 })
  const sb = db()

  if (b.action === 'profile') {
    const res = await isicGetProfile(b.card_number)
    await sb.from('isic_events').insert({
      card_number: b.card_number, action: 'profile', http_code: res.code, ok: res.ok,
      response_body: res.body.slice(0, 4000),
    })
    if (res.code !== 200) return NextResponse.json({ error: `ISIC respondió ${res.code}` }, { status: 400 })

    const url = xmlValue(res.body, 'registrationUrl')
    const estado = xmlValue(res.body, 'profileStatus')
    const creado = xmlValue(res.body, 'profileCreatedOn')
    await sb.from('isic_cards').update({
      registration_url: url, profile_status: estado,
      profile_created_at: creado || null, updated_at: new Date().toISOString(),
    }).eq('card_number', b.card_number)
    return NextResponse.json({ ok: true, registration_url: url, profile_status: estado, profile_created_at: creado })
  }

  if (b.action === 'notify') {
    const { data: c } = await sb.from('isic_cards')
      .select('card_number, first_name, email, registration_url, valid_to').eq('card_number', b.card_number).maybeSingle()
    if (!c) return NextResponse.json({ error: 'Carné no encontrado' }, { status: 404 })
    if (!c.email) return NextResponse.json({ error: 'Este carné no tiene correo registrado' }, { status: 400 })

    const { notifyIsicCard } = await import('@/lib/isic-notify')
    const n = await notifyIsicCard({
      to: c.email, firstName: String(c.first_name ?? '').split(' ')[0] || 'Estudiante',
      cardNumber: c.card_number, registrationUrl: c.registration_url, validTo: String(c.valid_to),
    })
    await sb.from('isic_events').insert({
      card_number: c.card_number, action: 'notify', ok: n.ok, response_body: n.error ?? 'reenviado a ' + c.email,
    })
    if (!n.ok) return NextResponse.json({ error: n.error ?? 'No se pudo enviar' }, { status: 500 })
    await sb.from('isic_cards').update({ notified_at: new Date().toISOString() }).eq('card_number', c.card_number)
    return NextResponse.json({ ok: true, sent_to: c.email })
  }

  return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 })
}
