import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveStudent } from '@/lib/student-identity'
import { telefonoE164 } from '@/lib/telefono'
import {
  categoriaElegible, esDelEquipo, esDelEquipoBitrix, estadoVisible, creditoDe,
  refrescarCalificados, COSTO_DEGREE, CREDITO_POR_REFERIDO, type LeadMin,
} from '@/lib/referrals'
import { bitrixConfigurado, negociacionBGU, ordenUmbral, crearNegociacionReferido } from '@/lib/bitrix'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function quienEs() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const ident = await getEffectiveStudent({ id: user.id, email: user.email })
  if (!ident) return { error: NextResponse.json({ error: 'Sin estudiante' }, { status: 403 }) }
  return { ident }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolverEstudiante(sb: any, ident: { email: string | null; document_number: string | null }) {
  if (ident.document_number) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, email, phone_number')
      .eq('document_number', ident.document_number).maybeSingle()
    if (data) return data
  }
  if (ident.email) {
    const { data } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, document_number, email, phone_number')
      .eq('email', ident.email).eq('disabled', false).maybeSingle()
    if (data) return data
  }
  return null
}

// ¿Este estudiante puede participar? Bachelor, Master o Doctorado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function programasElegibles(sb: any, studentId: string) {
  const { data: enrs } = await sb.from('academic_student_enrollments')
    .select('program_id, academic_programs(name, category:academic_programs_category(name))')
    .eq('student_id', studentId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((enrs ?? []) as any[]).filter(e => categoriaElegible(e.academic_programs?.category?.name))
}

// GET → mis referidos + crédito + catálogo de programas para el formulario
export async function GET() {
  const q = await quienEs(); if ('error' in q) return q.error
  const sb = db()
  const stu = await resolverEstudiante(sb, q.ident)
  if (!stu) return NextResponse.json({ error: 'Sin ficha de estudiante' }, { status: 404 })

  const elegibles = await programasElegibles(sb, stu.id)
  if (!elegibles.length) {
    return NextResponse.json({
      elegible: false,
      motivo: 'Free Degree es para estudiantes de Bachelor, Master y Doctorado.',
    })
  }

  // Los 100 dólares los dispara el PAGO del Enrollment del referido, no una
  // etapa del CRM. Se comprueba al abrir la pantalla para que el estudiante lo
  // vea el mismo día y no dependa de un cron.
  try { await refrescarCalificados(sb) } catch (e) { console.error('refrescar referidos', e) }

  const { data: refs } = await sb.from('referrals')
    .select('id, first_name, last_name, email, program_id, status, lead_id, qualified_at, created_at')
    .eq('referrer_student_id', stu.id).order('created_at', { ascending: false })

  const leadIds = (refs ?? []).map((r: { lead_id: string | null }) => r.lead_id).filter(Boolean)
  const leads = new Map<string, { stage: string | null; last_contact_at: string | null }>()
  if (leadIds.length) {
    const { data: ls } = await sb.from('sales_leads').select('id, stage, last_contact_at').in('id', leadIds)
    for (const l of ls ?? []) leads.set(l.id, l)
  }

  // Solo se ofrecen los programas del beneficio: Bachelor, Master y Doctorado.
  // Antes salía el catálogo entero y el estudiante podía recomendar un curso de
  // Formación Continua, que no da derecho a Free Degree — una promesa que el
  // sistema no iba a cumplir.
  const { data: progs } = await sb.from('academic_programs')
    .select('id, name, category:academic_programs_category(name)').order('name')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catalogo = ((progs ?? []) as any[])
    .filter(p => categoriaElegible(p.category?.name))
    .map(p => ({ id: p.id, name: p.name, categoria: p.category?.name ?? '' }))

  const credito = await creditoDe(sb, stu.id)

  return NextResponse.json({
    elegible: true,
    credito, costo_degree: COSTO_DEGREE, por_referido: CREDITO_POR_REFERIDO,
    programas: catalogo,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    referidos: ((refs ?? []) as any[]).map(r => ({
      id: r.id,
      nombre: [r.first_name, r.last_name].filter(Boolean).join(' '),
      email: r.email,
      programa: catalogo.find(p => p.id === r.program_id)?.name ?? null,
      estado: estadoVisible(r, r.lead_id ? leads.get(r.lead_id) ?? null : null),
      creado: r.created_at,
    })),
  })
}

// POST → registrar un referido
export async function POST(req: NextRequest) {
  const q = await quienEs(); if ('error' in q) return q.error
  const sb = db()
  const stu = await resolverEstudiante(sb, q.ident)
  if (!stu) return NextResponse.json({ error: 'Sin ficha de estudiante' }, { status: 404 })

  const elegibles = await programasElegibles(sb, stu.id)
  if (!elegibles.length) return NextResponse.json({ error: 'Free Degree es para estudiantes de Bachelor, Master y Doctorado' }, { status: 403 })

  const b = await req.json().catch(() => null) as {
    first_name?: string; last_name?: string; email?: string
    phone_code?: string; phone_local?: string; program_id?: string; consent?: boolean
  } | null

  const nombre = b?.first_name?.trim() ?? ''
  const email = b?.email?.trim().toLowerCase() ?? ''
  const code = b?.phone_code?.trim() ?? ''
  const local = b?.phone_local?.replace(/\D/g, '') ?? ''
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre de tu referido' }, { status: 400 })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'El correo no parece válido' }, { status: 400 })
  if (!/^\+\d{1,3}$/.test(code)) return NextResponse.json({ error: 'Elige el código del país (formato +51)' }, { status: 400 })
  if (local.length < 6) return NextResponse.json({ error: 'El número de celular está incompleto' }, { status: 400 })
  if (!b?.consent) return NextResponse.json({ error: 'Necesitamos que confirmes que tienes su permiso para compartir sus datos' }, { status: 400 })

  const phone = telefonoE164({ phone_code: code, phone_local: local })

  // ── Autoreferencia ────────────────────────────────────────────────────────
  if (email === String(stu.email ?? '').toLowerCase() || (phone && phone === stu.phone_number)) {
    return NextResponse.json({ error: 'No puedes referirte a ti mismo' }, { status: 400 })
  }
  // ── ¿Ya es estudiante nuestro? ────────────────────────────────────────────
  const { data: yaEs } = await sb.from('academic_students')
    .select('id').or(`email.eq.${email}${phone ? `,phone_number.eq.${phone}` : ''}`).limit(1)
  if ((yaEs ?? []).length) {
    return NextResponse.json({ error: 'Esa persona ya estudia con nosotros' }, { status: 409 })
  }
  // ── ¿Ya lo refirió alguien? Gana el primero ───────────────────────────────
  const { data: previo } = await sb.from('referrals')
    .select('id, referrer_student_id').neq('status', 'duplicado')
    .or(`email.eq.${email}${phone ? `,phone_number.eq.${phone}` : ''}`).limit(1)
  if ((previo ?? []).length) {
    const mio = previo![0].referrer_student_id === stu.id
    return NextResponse.json({
      error: mio ? 'Ya registraste a esa persona' : 'Esa persona ya fue referida por otro estudiante',
    }, { status: 409 })
  }

  // ── ¿Lo está trabajando ya el equipo de admisión? ─────────────────────────
  //
  // El CRM del equipo es Bitrix. El embudo interno de sales_leads es el de los
  // bots y solo se consulta cuando Bitrix no está configurado.
  let status = 'registrado'
  let leadPrevio = false
  let nota: string | null = null
  let negociacion: Awaited<ReturnType<typeof negociacionBGU>> = null

  if (bitrixConfigurado()) {
    try {
      negociacion = await negociacionBGU(email, phone)
      if (negociacion) {
        leadPrevio = true
        const umbral = await ordenUmbral(negociacion.embudo)
        const juicio = esDelEquipoBitrix(negociacion, umbral)
        nota = `${juicio.motivo} · embudo ${negociacion.embudo}`
        if (juicio.delEquipo) status = 'del_equipo'
      }
    } catch (e) {
      // Si el CRM no responde NO se decide a ciegas: dar por bueno un referido
      // que el equipo ya trabajaba cuesta 100 dólares y un conflicto interno.
      console.error('bitrix referidos', e)
      return NextResponse.json({
        error: 'No pudimos verificar con nuestro CRM en este momento. Inténtalo de nuevo en unos minutos.',
      }, { status: 503 })
    }
  } else {
    const { data: leads } = await sb.from('sales_leads')
      .select('id, stage, last_contact_at, created_at')
      .or(`email.eq.${email}${phone ? `,phone_number.eq.${phone}` : ''}`).limit(5)
    const lead: LeadMin | null = (leads ?? [])[0] ?? null
    if (lead) {
      leadPrevio = true
      const juicio = esDelEquipo(lead)
      nota = juicio.motivo
      if (juicio.delEquipo) status = 'del_equipo'
    }
  }

  const quienRefiere = [stu.first_name, stu.last_name, stu.second_last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ')
  const { data: prog } = b?.program_id
    ? await sb.from('academic_programs').select('name').eq('id', b.program_id).maybeSingle()
    : { data: null }

  // ── La negociación en Bitrix ──────────────────────────────────────────────
  //
  // Si el referido es del estudiante y no existía en el CRM, se crea allí a
  // nombre del bot. Sin eso, ese mismo prospecto puede entrar mañana por otra
  // vía y un asesor lo trabaja sin saber que Antonella y el estudiante ya
  // están en ello — que es justo lo que se quiere evitar.
  let bitrixContacto: number | null = null
  let bitrixNegociacion: number | null = null
  if (status === 'registrado' && bitrixConfigurado() && !negociacion) {
    try {
      const alta = await crearNegociacionReferido({
        nombre: nombre, apellidos: b?.last_name?.trim() || null,
        email, telefono: phone,
        programa: prog?.name ?? null,
        referente: quienRefiere, referenteDoc: stu.document_number ?? null,
      })
      bitrixContacto = alta.contact_id
      bitrixNegociacion = alta.deal_id
      nota = `Negociación creada en el embudo ${alta.embudo}`
    } catch (e) {
      // El referido no se pierde por esto: queda registrado y la hoja de
      // control lo muestra sin negociación para crearla a mano.
      console.error('bitrix alta referido', e)
      nota = `No se pudo crear la negociación en el CRM: ${e instanceof Error ? e.message : String(e)}`
    }
  } else if (negociacion) {
    bitrixNegociacion = Number(negociacion.id)
  }

  // ── El lead interno de Antonella ─────────────────────────────────────────
  let leadId: string | null = null
  if (status === 'registrado') {
    // La nota es lo primero que Antonella ve al abrir el lead: con eso arranca
    // la conversación diciendo quién lo recomendó.
    const aviso = `Referido por ${quienRefiere} (${stu.document_number ?? 's/d'}), estudiante nuestro.`
      + (prog?.name ? ` Interés: ${prog.name}.` : '')
      + (bitrixNegociacion ? ` Negociación Bitrix #${bitrixNegociacion}.` : '')
    const { data: nuevo, error } = await sb.from('sales_leads').insert({
      bot_key: 'antonella',
      phone: phone, phone_code: code, phone_local: local, phone_number: phone,
      name: [nombre, b?.last_name?.trim()].filter(Boolean).join(' '),
      email,
      program_interest: prog?.name ?? null,
      stage: 'nuevo',
      notes: aviso,
    }).select('id').single()
    if (error) return NextResponse.json({ error: 'No se pudo registrar: ' + error.message }, { status: 500 })
    leadId = nuevo.id
  }

  const { error: insErr } = await sb.from('referrals').insert({
    referrer_student_id: stu.id,
    first_name: nombre,
    last_name: b?.last_name?.trim() || null,
    email,
    phone_code: code, phone_local: local, phone_number: phone,
    program_id: b?.program_id || null,
    consent_at: new Date().toISOString(),
    status,
    lead_id: leadId,
    lead_previo: leadPrevio,
    lead_previo_nota: nota,
    bitrix_contact_id: bitrixContacto,
    bitrix_deal_id: bitrixNegociacion,
  })
  if (insErr) {
    // El índice único es la última palabra sobre "gana el primero": si dos
    // estudiantes registran a la vez, uno pierde aquí y hay que decírselo.
    if (/duplicate|unique/i.test(insErr.message)) {
      return NextResponse.json({ error: 'Esa persona acaba de ser referida por otro estudiante' }, { status: 409 })
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    status,
    aviso: status === 'del_equipo'
      ? 'Nuestro equipo de admisión ya está conversando con esa persona, así que este referido no suma al beneficio. Gracias igual por recomendarnos.'
      : null,
  })
}
