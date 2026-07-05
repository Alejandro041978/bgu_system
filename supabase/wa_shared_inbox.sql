-- ============================================================================
-- Buzón compartido de WhatsApp (shared inbox) para el equipo de Servicio al Estudiante.
-- Un número de equipo; las conversaciones entran a una cola y las ejecutivas las reclaman.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

-- Entrada en 'bots' para el número del equipo (role='inbox' → el webhook NO responde con IA)
insert into bots (key, name, role, active)
values ('servicio', 'Servicio al Estudiante', 'inbox', true)
on conflict (key) do nothing;

-- Conversaciones (una por cliente + número de equipo)
create table if not exists wa_conversations (
  id                   uuid primary key default gen_random_uuid(),
  inbox_key            text not null,               -- bots.key del número de equipo (ej. 'servicio')
  customer_phone       text not null,               -- 'whatsapp:+...'
  customer_name        text,
  status               text not null default 'open', -- open | closed
  assigned_to          uuid,                          -- auth.users id de la ejecutiva (null = en cola)
  assigned_name        text,
  unread_count         integer not null default 0,
  last_message_at      timestamptz,
  last_message_preview text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists wa_conversations_inbox_phone on wa_conversations(inbox_key, customer_phone);
create index if not exists wa_conversations_status_idx on wa_conversations(status, assigned_to);

-- Mensajes de cada conversación
create table if not exists wa_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references wa_conversations(id) on delete cascade,
  direction       text not null,        -- in (del cliente) | out (de la ejecutiva)
  body            text,
  agent_id        uuid,                  -- quién respondió (para 'out')
  agent_name      text,
  created_at      timestamptz not null default now()
);
create index if not exists wa_messages_conv_idx on wa_messages(conversation_id, created_at);
