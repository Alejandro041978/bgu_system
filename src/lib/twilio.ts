// Envía un mensaje de WhatsApp por Twilio con credenciales explícitas.
// Devuelve el SID del mensaje para poder seguir sus vistos (statusCallback:
// Twilio notifica sent/delivered/read a esa URL).
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  creds: { from: string; sid: string; token: string },
  opts?: { statusCallback?: string }
): Promise<{ ok: boolean; error?: string; messageSid?: string }> {
  const params = new URLSearchParams({ From: creds.from, To: to, Body: body })
  if (opts?.statusCallback) params.set('StatusCallback', opts.statusCallback)
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${creds.sid}:${creds.token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  if (!resp.ok) {
    const t = await resp.text()
    return { ok: false, error: `Twilio ${resp.status}: ${t}` }
  }
  const d = await resp.json().catch(() => null) as { sid?: string } | null
  return { ok: true, messageSid: d?.sid }
}
