// ---------------------------------------------------------------------------
// Notificaciones al estudiante — el único camino de correo del ERP (08/09/2026).
//
// notificarEstudiante() envía por Resend Y registra en student_notifications
// en el mismo acto. Regla: si no está en la bitácora, no se envió. Un fallo
// de correo NO revierte el acto académico que lo disparó: queda 'fallida'
// con su error, visible y reenviable desde la página Notificaciones.
//
// Destinatarios (decisión del usuario): AMBOS correos — el institucional
// (@blackwell.pro) y el personal — cuando existen.
// ---------------------------------------------------------------------------
import { Resend } from 'resend'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface NotificacionInput {
  studentId: string
  enrollmentId?: string | null
  kind: string
  subject: string
  html: string
  relatedId?: string | null
  triggeredBy: string          // email de la persona, o 'cron:…'
}

export async function notificarEstudiante(sb: SB, n: NotificacionInput): Promise<{ ok: boolean; error?: string }> {
  const { data: stu } = await sb.from('academic_students')
    .select('email, email_alt').eq('id', n.studentId).maybeSingle()
  const destinos = [...new Set([stu?.email_alt, stu?.email].filter(Boolean))] as string[]

  let status: 'enviada' | 'fallida' = 'enviada'
  let error: string | null = null
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    status = 'fallida'; error = 'Resend sin configurar'
  } else if (!destinos.length) {
    status = 'fallida'; error = 'El estudiante no tiene ningún correo registrado'
  } else {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const r = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL, to: destinos, subject: n.subject, html: n.html,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((r as any)?.error) { status = 'fallida'; error = String((r as any).error?.message ?? (r as any).error) }
    } catch (e) {
      status = 'fallida'; error = e instanceof Error ? e.message : 'error de envío'
    }
  }

  await sb.from('student_notifications').insert({
    student_id: n.studentId, enrollment_id: n.enrollmentId ?? null,
    kind: n.kind, subject: n.subject, body_html: n.html,
    to_emails: destinos, status, error,
    related_id: n.relatedId ?? null, triggered_by: n.triggeredBy,
  }).then(({ error: e }: { error: { message: string } | null }) => {
    // La bitácora es la garantía: si no se pudo registrar, que se sepa arriba.
    if (e) { status = 'fallida'; error = `bitácora: ${e.message}` }
  })

  return status === 'enviada' ? { ok: true } : { ok: false, error: error ?? 'fallida' }
}

// ── Plantillas (borradores institucionales; el usuario los ajusta a gusto) ──

const fecha = (d: string | null | undefined) =>
  d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

function marco(titulo: string, cuerpo: string): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#1a34a8,#2563eb);padding:28px 32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:20px;font-weight:700;">${titulo}</h1>
      <p style="color:#bfdbfe;margin:6px 0 0;font-size:13px;">Blackwell Global University · Registros Académicos</p>
    </div>
    <div style="padding:32px;">${cuerpo}</div>
    <div style="padding:16px 32px;border-top:1px solid #f3f4f6;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">Este es un aviso oficial de tu expediente académico. Si tienes preguntas, responde a este correo o escribe a Registros.</p>
    </div>
  </div></body></html>`
}

const parrafo = (t: string) => `<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 14px;">${t}</p>`
const dato = (k: string, v: string) => `<tr><td style="color:#9ca3af;font-size:13px;padding:4px 12px 4px 0;white-space:nowrap;">${k}</td><td style="color:#111827;font-size:13px;font-weight:600;padding:4px 0;">${v}</td></tr>`
const tabla = (filas: string) => `<table style="margin:0 0 18px;border-collapse:collapse;">${filas}</table>`

export function plantillaLOA(a: { nombre: string; programa: string; resolucion: string | null; fechaRetiro: string | null; vence: string | null }) {
  return {
    subject: 'Registro de tu Licencia Académica (LOA)',
    html: marco('Licencia Académica registrada',
      parrafo(`Hola, <strong>${a.nombre}</strong>:`) +
      parrafo(`Registramos tu <strong>Licencia Académica (LOA)</strong> — una pausa temporal de tus estudios.`) +
      tabla(
        dato('Programa', a.programa) +
        dato('Resolución', a.resolucion ?? 'en emisión') +
        dato('Fecha de inicio', fecha(a.fechaRetiro)) +
        dato('Vence', fecha(a.vence))
      ) +
      parrafo(`Durante la licencia tu acceso a las aulas del campus virtual queda en pausa. <strong>Tus calificaciones y tu avance se conservan intactos</strong>.`) +
      parrafo(`Puedes reincorporarte en cualquier momento antes del vencimiento escribiendo a Registros. Si la licencia vence sin reincorporación, pasa a retiro institucional (IW), que tiene su propio proceso de reingreso.`)),
  }
}

export function plantillaIW(a: { nombre: string; programa: string; resolucion: string | null; fechaRetiro: string | null; desdeLOA: boolean }) {
  return {
    subject: 'Registro de tu Retiro Institucional (IW)',
    html: marco('Retiro Institucional registrado',
      parrafo(`Hola, <strong>${a.nombre}</strong>:`) +
      parrafo(a.desdeLOA
        ? `Tu Licencia Académica venció sin reincorporación, por lo que registramos tu <strong>Retiro Institucional (IW)</strong>.`
        : `Registramos tu <strong>Retiro Institucional (IW)</strong> del programa.`) +
      tabla(
        dato('Programa', a.programa) +
        dato('Resolución', a.resolucion ?? 'en emisión') +
        dato('Fecha', fecha(a.fechaRetiro))
      ) +
      parrafo(`Tu acceso a las aulas del campus virtual queda suspendido. <strong>Tu historial académico y tus calificaciones se conservan íntegros</strong> en tu expediente.`) +
      parrafo(`Si en el futuro deseas retomar tus estudios, la vía es el trámite de <strong>Re-Entry</strong>, que puedes solicitar desde tu portal de estudiante. Estaremos encantados de recibirte de vuelta.`)),
  }
}

export function plantillaReentry(a: { nombre: string; programa: string; resolucion: string | null }) {
  return {
    subject: '¡Bienvenido de vuelta! Tu reincorporación está confirmada',
    html: marco('Reincorporación confirmada',
      parrafo(`Hola, <strong>${a.nombre}</strong>:`) +
      parrafo(`Tu trámite de <strong>Re-Entry</strong> fue procesado: tu retiro ${a.resolucion ? `(${a.resolucion}) ` : ''}del programa <strong>${a.programa}</strong> queda levantado y tu matrícula vuelve a estar activa.`) +
      parrafo(`Tu acceso a las aulas del campus virtual se restituye en las próximas horas, y tu registro curricular y plan de pagos ya reflejan tu regreso — revísalos en tu portal.`) +
      parrafo(`Nos alegra tenerte de vuelta. ¡Éxitos en esta nueva etapa!`)),
  }
}

export function plantillaReversion(a: { nombre: string; programa: string; resolucion: string | null }) {
  return {
    subject: 'Tu reincorporación está aplicada',
    html: marco('Reincorporación aplicada',
      parrafo(`Hola, <strong>${a.nombre}</strong>:`) +
      parrafo(`La universidad aplicó la <strong>reversión de tu retiro</strong> ${a.resolucion ? `(${a.resolucion}) ` : ''}del programa <strong>${a.programa}</strong>: tu matrícula vuelve a estar activa, sin costo de trámite.`) +
      parrafo(`Tu acceso a las aulas del campus virtual se restituye en las próximas horas, y tu registro curricular y plan de pagos ya reflejan tu regreso — revísalos en tu portal.`) +
      parrafo(`Nos alegra tenerte de vuelta. ¡Éxitos en esta nueva etapa!`)),
  }
}
