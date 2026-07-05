// Envía un mensaje de WhatsApp por Twilio con credenciales explícitas.
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  creds: { from: string; sid: string; token: string }
): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${creds.sid}:${creds.token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: creds.from, To: to, Body: body }).toString(),
  })
  if (!resp.ok) {
    const t = await resp.text()
    return { ok: false, error: `Twilio ${resp.status}: ${t}` }
  }
  return { ok: true }
}
