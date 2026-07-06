-- ============================================================================
-- Auto-asignación por especialidad (round-robin) + métrica desde la llegada del cliente.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

-- Skills y disponibilidad de cada agente
create table if not exists agent_skills (
  user_id          uuid primary key,             -- auth.users id de la agente
  agent_name       text,
  languages        text[] not null default '{}', -- ['es','en'] · vacío = todos los idiomas
  topics           text[] not null default '{}', -- ['pagos','admision'...] · vacío = todos los temas
  is_supervisor    boolean not null default false,
  online           boolean not null default true,
  last_assigned_at timestamptz,                    -- para el round-robin
  created_at       timestamptz not null default now()
);

-- Métrica de tiempo de respuesta (desde la llegada del cliente, no desde el reclamo)
alter table wa_conversations add column if not exists first_customer_at timestamptz;
alter table wa_conversations add column if not exists first_response_at timestamptz;
