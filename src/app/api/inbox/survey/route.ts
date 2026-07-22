import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { surveyToken, closeConv } from '@/lib/inbox-autoclose'

export const revalidate = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const page = (emoji: string, titulo: string, texto: string) => new Response(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:40px 32px;text-align:center;max-width:360px">
    <div style="font-size:52px">${emoji}</div>
    <h1 style="font-size:20px;color:#111827;margin:16px 0 8px">${titulo}</h1>
    <p style="font-size:14px;color:#6b7280;margin:0">${texto}</p>
    <p style="font-size:11px;color:#d1d5db;margin:24px 0 0">Blackwell Global University</p>
  </div>
</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })

// Un clic en la carita del correo de evaluación: registra buena/mala y cierra
// el caso. El token evita votos forjados; un solo voto por caso.
export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get('c')
  const rParam = req.nextUrl.searchParams.get('r')
  const t = req.nextUrl.searchParams.get('t')
  if (!c || !rParam || !t || !['buena', 'regular', 'mala'].includes(rParam) || t !== surveyToken(c)) {
    return page('🤔', 'Enlace no válido', 'Este enlace de evaluación no es válido o expiró.')
  }

  const sb = db()
  const { data: conv } = await sb.from('wa_conversations')
    .select('id, status, rating, language, case_number').eq('id', c).maybeSingle()
  if (!conv) return page('🤔', 'Caso no encontrado', 'No encontramos este caso.')

  const en = conv.language === 'en'
  if (conv.rating) {
    return page('✅', en ? 'Already recorded' : 'Ya registrado',
      en ? 'We already had your feedback for this case. Thank you!' : 'Ya teníamos tu evaluación de este caso. ¡Gracias!')
  }

  const now = new Date().toISOString()
  if (conv.status === 'open') {
    await closeConv(sb, conv.id, 'evaluado', { rating: rParam, rating_at: now })
  } else {
    await sb.from('wa_conversations').update({ rating: rParam, rating_at: now, updated_at: now }).eq('id', conv.id)
  }

  const emoji = rParam === 'buena' ? '😊' : rParam === 'regular' ? '😐' : '🙏'
  const texto = en
    ? (rParam === 'buena' ? 'Glad we could help. Your case is now closed.'
      : rParam === 'regular' ? 'Thanks — we will keep working to do better. Your case is now closed.'
      : 'Sorry we fell short — your feedback helps us improve. Your case is now closed.')
    : (rParam === 'buena' ? 'Nos alegra haberte ayudado. Tu caso queda cerrado.'
      : rParam === 'regular' ? 'Gracias — seguiremos trabajando para mejorar. Tu caso queda cerrado.'
      : 'Lamentamos no haber estado a la altura: tu opinión nos ayuda a mejorar. Tu caso queda cerrado.')
  return page(emoji, en ? 'Thank you!' : '¡Gracias!', texto)
}
