-- ============================================================================
-- Plantillas de facturación (billing plans) por (programa + convocatoria).
-- Al matricular, se generan las account_charges del estudiante desde la plantilla:
--   matrícula (registration_fee) + N cuotas (installments_count × installment_amount).
-- Ejecutar en Supabase.
-- ============================================================================

-- Origen de cada cuota: 'systemactiva' (histórico) | 'erp' (generado por plantilla)
alter table account_charges add column if not exists source text not null default 'systemactiva';

create table if not exists billing_plans (
  id                   uuid primary key default gen_random_uuid(),
  program_id           uuid references academic_programs(id),
  convocatoria_id      uuid references convocatorias(id),
  currency             text not null default 'USD',
  registration_fee     numeric not null default 0,
  registration_concept integer,              -- charge_type de la matrícula (ver account_concepts)
  installments_count   integer not null default 0,
  installment_amount   numeric not null default 0,
  installment_concept  integer,              -- charge_type de las cuotas
  first_due_date       date,                 -- vencimiento de la primera cuota
  due_day              integer,              -- día del mes de vencimiento (opcional; si null usa el día de first_due_date)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (program_id, convocatoria_id)
);
