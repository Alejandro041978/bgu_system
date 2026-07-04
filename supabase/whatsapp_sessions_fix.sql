-- ============================================================================
-- Fix: whatsapp_sessions le faltan columnas que el webhook necesita.
-- Sin ellas, Sofia nunca guarda la sesión y re-identifica en cada mensaje.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

-- Crear la tabla si no existiera (por si acaso)
create table if not exists whatsapp_sessions (
  phone text primary key
);

-- Agregar todas las columnas que usa el código (idempotente)
alter table whatsapp_sessions
  add column if not exists messages       jsonb   not null default '[]'::jsonb,
  add column if not exists pending_ticket jsonb,
  add column if not exists identified     boolean not null default false,
  add column if not exists user_info      jsonb,
  add column if not exists updated_at     timestamptz not null default now();

-- Garantizar que phone sea único (por si la tabla se creó sin PK en phone)
create unique index if not exists whatsapp_sessions_phone_key on whatsapp_sessions(phone);
