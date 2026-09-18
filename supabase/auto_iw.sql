-- ---------------------------------------------------------------------------
-- IW automático por abandono (18/09/2026): interruptor y tope diario.
--
-- Regla (lib/auto-iw.ts): 35 días sin conexión al campus ni al ERP + deuda
-- VENCIDA + sin LOA + sin respuesta a Camila (2+ mensajes, 7+ días) → preaviso
-- el día 28 e IW el día 35. El IW nace vigente y su ejecución se revisa y
-- aprueba en el Gestor IW · Re-Entry.
--
-- enabled = false → "modo ensayo": el proceso nocturno calcula y la pantalla
-- muestra a quién le tocaría, pero no envía preavisos ni crea IW.
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------
create table if not exists auto_iw_settings (
  id          integer primary key check (id = 1),
  enabled     boolean not null default false,
  daily_cap   integer not null default 10 check (daily_cap between 1 and 100),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

insert into auto_iw_settings (id) values (1) on conflict (id) do nothing;

alter table auto_iw_settings enable row level security;
grant all on table auto_iw_settings to service_role;
