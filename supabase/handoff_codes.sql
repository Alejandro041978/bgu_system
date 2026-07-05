-- ============================================================================
-- Handoff Sofia → humano: códigos de enlace con resumen ejecutivo e idioma.
-- Cuando el estudiante pide un humano, Sofia genera un código; el número humano
-- solo abre conversación si el primer mensaje trae un código válido (puerta dura).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

create table if not exists handoff_codes (
  code            text primary key,               -- ej. 'ENLACE-4827'
  customer_phone  text,                            -- 'whatsapp:+...' del estudiante
  bot_key         text,                            -- bot que lo generó (sofia)
  summary         text,                            -- resumen ejecutivo para el asesor
  language        text,                            -- 'es' | 'en' | 'other'
  student_name    text,
  document_number text,
  used            boolean not null default false,
  used_at         timestamptz,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '48 hours')
);
create index if not exists handoff_codes_phone_idx on handoff_codes(customer_phone);

-- Contexto de Sofia en la conversación de la bandeja
alter table wa_conversations add column if not exists summary  text;
alter table wa_conversations add column if not exists language text;
