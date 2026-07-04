import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface Bot {
  key: string
  name: string
  role: string | null
  prompt: string
  twilio_number: string | null
  active: boolean
}

const FALLBACK_PROMPT = `Eres un asistente virtual de Blackwell Global University (BGU).
Detecta el idioma del usuario y responde en ese mismo idioma. Sé claro y honesto: si no tienes un dato, dilo en lugar de inventar.`

/** Lee la configuración de un bot por su key. */
export async function getBot(botKey: string): Promise<Bot | null> {
  const { data } = await (db() as any)
    .from('bots')
    .select('key, name, role, prompt, twilio_number, active')
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
  const { data } = await (db() as any)
    .from('bots')
    .select('key, name, role, prompt, twilio_number, active')
    .eq('twilio_number', toNumber)
    .eq('active', true)
    .maybeSingle()
  return (data as Bot | null) ?? null
}
