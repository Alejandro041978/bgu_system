-- ============================================================================
-- Bandeja multicanal: agrega el canal CORREO al buzón compartido (además de WhatsApp).
-- Reutiliza wa_conversations / wa_messages como tablas genéricas del helpdesk.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

-- Conversaciones: canal + campos de correo + tema para enrutamiento
alter table wa_conversations add column if not exists channel        text not null default 'whatsapp'; -- whatsapp | email
alter table wa_conversations add column if not exists customer_email text;
alter table wa_conversations add column if not exists subject        text;
alter table wa_conversations add column if not exists topic          text;   -- tema/especialidad detectada
alter table wa_conversations add column if not exists thread_ref     text;   -- Message-ID raíz del hilo de correo

create index if not exists wa_conversations_channel_idx on wa_conversations(channel, status);
create index if not exists wa_conversations_email_idx on wa_conversations(lower(customer_email));

-- Mensajes: cuerpo HTML, asunto y Message-ID para threading de correo
alter table wa_messages add column if not exists subject    text;
alter table wa_messages add column if not exists html       text;
alter table wa_messages add column if not exists message_id text;   -- Message-ID del correo
alter table wa_messages add column if not exists from_addr  text;

create index if not exists wa_messages_message_id_idx on wa_messages(message_id);

-- El índice único (inbox_key, customer_phone) no estorba al correo:
-- las filas de correo tienen customer_phone NULL y Postgres trata los NULL como distintos.
