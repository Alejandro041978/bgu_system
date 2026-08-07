import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import {
  nuevoCodigo, hashCodigo, enmascararCorreo, VIGENCIA_MINUTOS, MAX_INTENTOS_CODIGO,
  TOPE_POR_DOCUMENTO, TOPE_POR_IP, ESPERA_ENTRE_RESETEOS_HORAS, SITUACIONES_AUTOSERVICIO,
  type Desenlace,
} from '@/lib/email-recovery'
import { getStudentAccountState, resetStudentPassword, notifyStudentEmail, langFor, googleConfigured } from '@/lib/google-workspace'

export const revalidate = 0
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Página pública: https://system.blackwell.university/form/recoverymail
//
// Dos pasos, y el orden es la medida de seguridad más importante de todo esto:
//
//   1. documento  → SIEMPRE la misma respuesta, exista o no
//   2. código     → verificado, y solo ENTONCES se explica la situación
//
// Al revés —explicar antes de verificar— la página sería un buscador de estado
// académico: cualquiera teclea documentos y averigua quién estudia, quién se
// retiró y quién se tituló. Además le regalaría a un atacante la lista de
// buzones dormidos, que son los más apetecibles.
//
// El precio es que quien no tenga ningún canal no llega nunca a la explicación
// y solo ve "escribe a Servicios". Es el peaje de no ser un oráculo.

const RESPUESTA_OPACA = {
  ok: true,
  mensaje: 'Si el documento corresponde a un estudiante con correo institucional, enviamos un código de verificación al canal registrado en su ficha.',
}

const ipDe = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as {
    action?: 'start' | 'verify'
    document?: string
    code?: string
    birth_date?: string
  } | null
  const documento = String(b?.document ?? '').replace(/[^0-9A-Za-z]/g, '').trim()
  if (!documento || documento.length < 5) {
    return NextResponse.json({ error: 'Escribe tu número de documento' }, { status: 400 })
  }
  const sb = db()
  const ip = ipDe(req)
  const ua = req.headers.get('user-agent')?.slice(0, 300) ?? null

  // ── Paso 1: pedir el código ──────────────────────────────────────────────
  if (b?.action !== 'verify') {
    const haceUnaHora = new Date(Date.now() - 3600_000).toISOString()
    const [{ count: porDoc }, { count: porIp }] = await Promise.all([
      sb.from('email_recovery_requests').select('id', { count: 'exact', head: true })
        .eq('document', documento).gte('created_at', haceUnaHora),
      ip ? sb.from('email_recovery_requests').select('id', { count: 'exact', head: true })
        .eq('ip', ip).gte('created_at', haceUnaHora) : Promise.resolve({ count: 0 }),
    ])
    // Callado: decir "has excedido el límite" ya confirma que el documento
    // interesa, y le dice al abusador cuándo volver.
    if ((porDoc ?? 0) >= TOPE_POR_DOCUMENTO || (porIp ?? 0) >= TOPE_POR_IP) return NextResponse.json(RESPUESTA_OPACA)

    const { data: est } = await sb.from('academic_students')
      .select('id, first_name, last_name, second_last_name, email, email_alt, phone_number, situation, country, disabled')
      .eq('document_number', documento).maybeSingle()

    // El canal es el CORREO PERSONAL. Ojo con los campos: en este ERP el
    // institucional vive en email_alt y el personal en email — al revés de lo
    // que sugieren los nombres.
    const personal = est && !est.disabled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(est.email ?? '')) ? String(est.email) : null

    const fila = {
      document: documento, student_id: est?.id ?? null, ip, user_agent: ua,
    }
    if (!est || !personal) {
      // Se registra igual: los intentos contra documentos que no existen son
      // justo los que delatan a quien está probando a ciegas.
      await sb.from('email_recovery_requests').insert({ ...fila, outcome: est ? 'sin_canal' : 'documento_desconocido' })
      return NextResponse.json(RESPUESTA_OPACA)
    }

    const codigo = nuevoCodigo()
    const { data: req0 } = await sb.from('email_recovery_requests').insert({
      ...fila,
      code_hash: hashCodigo(codigo, documento),
      channel: 'email',
      channel_hint: enmascararCorreo(personal),
      expires_at: new Date(Date.now() + VIGENCIA_MINUTOS * 60_000).toISOString(),
    }).select('id, channel_hint').single()

    const nombre = String(est.first_name ?? '').split(' ')[0] || ''
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      // send() devuelve { data, error } en vez de lanzar: sin mirarlo, el
      // estudiante esperaría un código que nunca salió.
      const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: personal,
        subject: `${codigo} es tu código de verificación · Blackwell Global University`,
        html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;padding:40px 20px">
  <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden">
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:18px">Blackwell Global University</h1>
    </div>
    <div style="padding:32px;text-align:center">
      <p style="color:#111827;font-size:15px;margin:0 0 20px">Hola${nombre ? `, <strong>${nombre}</strong>` : ''}</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px;line-height:1.6">
        Este es tu código para recuperar el acceso a tu <strong>correo institucional</strong>.
        Vence en ${VIGENCIA_MINUTOS} minutos.
      </p>
      <p style="font-size:34px;font-weight:700;letter-spacing:10px;color:#1d4ed8;font-family:monospace;margin:0 0 20px">${codigo}</p>
      <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6">
        Si no pediste esto, ignora este mensaje y avisa a Servicios al Estudiante:
        alguien está intentando entrar a tu cuenta.
      </p>
    </div>
  </div>
</div>`,
      })
      if (error) console.error('recoverymail: Resend rechazó el código', error)
    }
    return NextResponse.json({ ...RESPUESTA_OPACA, request_id: req0?.id, hint: req0?.channel_hint })
  }

  // ── Paso 2: verificar el código y resolver ───────────────────────────────
  const codigo = String(b?.code ?? '').replace(/\D/g, '')
  if (codigo.length !== 6) return NextResponse.json({ error: 'El código tiene 6 dígitos' }, { status: 400 })

  const { data: sol } = await sb.from('email_recovery_requests')
    .select('*').eq('document', documento).not('code_hash', 'is', null).is('verified_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (!sol || !sol.expires_at || new Date(sol.expires_at) < new Date()) {
    return NextResponse.json({ error: 'El código venció. Pide uno nuevo.' }, { status: 400 })
  }
  if ((sol.attempts ?? 0) >= MAX_INTENTOS_CODIGO) {
    return NextResponse.json({ error: 'Demasiados intentos. Pide un código nuevo.' }, { status: 429 })
  }
  if (sol.code_hash !== hashCodigo(codigo, documento)) {
    await sb.from('email_recovery_requests').update({ attempts: (sol.attempts ?? 0) + 1 }).eq('id', sol.id)
    return NextResponse.json({ error: 'Código incorrecto' }, { status: 400 })
  }

  await sb.from('email_recovery_requests').update({ verified_at: new Date().toISOString() }).eq('id', sol.id)

  const { data: est } = await sb.from('academic_students')
    .select('id, first_name, last_name, second_last_name, email, email_alt, situation, country, date_of_birth')
    .eq('id', sol.student_id).maybeSingle()
  if (!est) return NextResponse.json({ error: 'No se pudo completar. Escribe a Servicios al Estudiante.' }, { status: 500 })

  // Fecha de nacimiento: refuerzo, NO cerradura. 128 estudiantes no la tienen
  // en el sistema y exigirla los dejaría fuera por un hueco de datos, no por
  // seguridad. Se pide solo a quien la tiene registrada.
  if (est.date_of_birth) {
    const suya = String(est.date_of_birth).slice(0, 10)
    const dada = String(b?.birth_date ?? '').slice(0, 10)
    if (!dada) return NextResponse.json({ ok: true, need_birth_date: true })
    if (dada !== suya) {
      await sb.from('email_recovery_requests').update({ attempts: (sol.attempts ?? 0) + 1 }).eq('id', sol.id)
      return NextResponse.json({ error: 'Los datos no coinciden' }, { status: 400 })
    }
  }

  const cerrar = async (outcome: Desenlace, payload: Record<string, unknown>) => {
    await sb.from('email_recovery_requests').update({ outcome }).eq('id', sol.id)
    return NextResponse.json({ ok: true, outcome, ...payload })
  }

  const institucional = String(est.email_alt ?? '')
  const nombre = [est.first_name, est.last_name, est.second_last_name].filter(Boolean).join(' ')

  // A partir de aquí SÍ se explica: ya demostró que es él, así que contarle su
  // propia situación no filtra nada.
  if (!institucional.toLowerCase().endsWith('@blackwell.pro')) {
    return cerrar('sin_correo', {
      mensaje: 'Tu programa no incluye correo institucional @blackwell.pro. El correo institucional se entrega a los estudiantes de Bachelor, Master y Doctorado. Usa tu correo personal para comunicarte con la universidad.',
    })
  }
  if (!SITUACIONES_AUTOSERVICIO.has(String(est.situation))) {
    return cerrar('requiere_servicios', {
      mensaje: 'Tu situación académica actual requiere que un asesor revise la solicitud. Escribe a Servicios al Estudiante indicando tu documento y te ayudarán a recuperar el acceso.',
    })
  }
  if (!googleConfigured()) {
    return cerrar('requiere_servicios', { mensaje: 'No podemos completar el proceso ahora. Escribe a Servicios al Estudiante.' })
  }

  const estado = await getStudentAccountState(institucional).catch(() => null)
  if (!estado || !estado.exists) {
    return cerrar('cuenta_inexistente', {
      mensaje: 'Tu correo institucional todavía no está creado. Escribe a Servicios al Estudiante y lo activan.',
    })
  }
  if (estado.suspended) {
    return cerrar('cuenta_suspendida', {
      mensaje: 'Tu correo institucional está desactivado. Escribe a Servicios al Estudiante indicando tu documento para que revisen si puede reactivarse.',
    })
  }

  // Un reseteo legítimo no se repite cada hora.
  const desde = new Date(Date.now() - ESPERA_ENTRE_RESETEOS_HORAS * 3600_000).toISOString()
  const { count: recientes } = await sb.from('email_recovery_requests')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', est.id).eq('outcome', 'reset').gte('created_at', desde)
  if ((recientes ?? 0) > 0) {
    return cerrar('requiere_servicios', {
      mensaje: `Ya restablecimos tu contraseña en las últimas ${ESPERA_ENTRE_RESETEOS_HORAS} horas. Revisa tu correo personal; si no la encuentras, escribe a Servicios al Estudiante.`,
    })
  }

  const creada = await resetStudentPassword(institucional)
  // Las instrucciones van al correo PERSONAL, nunca al institucional: es
  // justamente el buzón al que no puede entrar.
  await notifyStudentEmail(String(est.email), nombre, creada, langFor(est.country), 'reset').catch(e => {
    console.error('recoverymail: no se pudo enviar la contraseña nueva', e)
  })

  return cerrar('reset', {
    mensaje: `Listo. Enviamos las instrucciones de acceso a ${sol.channel_hint}. Tendrás que cambiar la contraseña al entrar.`,
  })
}
