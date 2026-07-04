import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface Bot {
  key: string
  name: string
  role: string | null
  prompt: string
  twilio_number: string | null
  twilio_account_sid: string | null
  twilio_auth_token: string | null
  active: boolean
}

const BOT_COLS = 'key, name, role, prompt, twilio_number, twilio_account_sid, twilio_auth_token, active'

const FALLBACK_PROMPT = `Eres un asistente virtual de Blackwell Global University (BGU).
Detecta el idioma del usuario y responde en ese mismo idioma. Sé claro y honesto: si no tienes un dato, dilo en lugar de inventar.`

/** Lee la configuración de un bot por su key. */
export async function getBot(botKey: string): Promise<Bot | null> {
  const { data } = await db()
    .from('bots')
    .select(BOT_COLS)
    .eq('key', botKey)
    .maybeSingle()
  return (data as Bot | null) ?? null
}

/** Devuelve el prompt maestro del bot (o un fallback seguro). */
export async function getBotPrompt(botKey: string): Promise<string> {
  const bot = await getBot(botKey)
  return bot?.prompt?.trim() ? bot.prompt : FALLBACK_PROMPT
}

/** Resuelve qué bot corresponde a un número de WhatsApp de destino (Twilio 'To'). */
export async function getBotByTwilioNumber(toNumber: string): Promise<Bot | null> {
  if (!toNumber) return null
  const { data } = await db()
    .from('bots')
    .select(BOT_COLS)
    .eq('twilio_number', toNumber)
    .eq('active', true)
    .maybeSingle()
  return (data as Bot | null) ?? null
}
