-- ============================================================================
-- Emisión de documentos (área de Registros). Fase 1.
--   document_types    = catálogo configurable (requisitos, costo, etapas, plantilla)
--   document_requests = solicitudes de estudiantes (admin o portal), con su flujo
-- Ejecutar en Supabase.
-- ============================================================================
create table if not exists document_types (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  price          numeric not null default 0,
  currency       text not null default 'USD',
  charge_concept integer,                                  -- account_concepts.type_code para el cargo
  template_body  text,                                     -- plantilla con {{placeholders}}
  requirements   jsonb not null default '[]'::jsonb,        -- [{ kind:'graduated'|'no_debt'|'enrolled'|'manual', description }]
  stages         jsonb not null default '[]'::jsonb,        -- [{ name, fields:[{ key, label }] }]
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists document_requests (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid references academic_students(id),
  document_type_id     uuid references document_types(id),
  program_id           uuid references academic_programs(id),
  status               text not null default 'pending',    -- pending | payment | in_progress | ready | delivered | rejected
  stage_index          integer not null default 0,          -- etapa humana actual
  requested_by         text,                                -- 'admin:<uid>' | 'student'
  requested_at         timestamptz not null default now(),
  charge_external_id   uuid,                                -- account_charges.external_id si tiene costo
  paid                 boolean not null default false,
  document_url         text,                                -- PDF emitido
  field_values         jsonb not null default '{}'::jsonb,   -- valores capturados en etapas
  requirements_checked jsonb not null default '[]'::jsonb,   -- [{ kind, ok, note }]
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists document_requests_student_idx on document_requests(student_id);
create index if not exists document_requests_status_idx on document_requests(status);
