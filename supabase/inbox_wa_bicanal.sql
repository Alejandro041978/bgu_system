-- ---------------------------------------------------------------------------
-- Helpdesk bicanal (10/09/2026): invitación de WhatsApp en casos de correo.
--
-- Al crear un caso de correo con teléfono conocido se envía la plantilla
-- aprobada de Meta ("recibimos tu ticket #N; si prefieres, sigue por
-- WhatsApp"). Si el estudiante responde, su mensaje se adjunta AL MISMO caso
-- (cascada: teléfono invitado → #ticket en el texto → más reciente), la
-- ventana de 24h queda abierta y el agente puede responder por cualquiera de
-- los dos canales desde la misma conversación.
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

ALTER TABLE wa_conversations
  ADD COLUMN IF NOT EXISTS wa_invite_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_invite_phone text;

-- Canal del MENSAJE dentro de un caso bicanal ('whatsapp' | 'email'; null =
-- el canal propio de la conversación, comportamiento histórico).
ALTER TABLE wa_messages
  ADD COLUMN IF NOT EXISTS via text;

CREATE INDEX IF NOT EXISTS idx_wa_conversations_invite_phone
  ON wa_conversations (wa_invite_phone) WHERE wa_invite_phone IS NOT NULL;
