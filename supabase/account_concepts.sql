-- ============================================================================
-- Conceptos editables para los Type crudos de SystemActiva (cuotas y pagos).
-- Mapea Installment.Type / Payment.Type -> abreviatura + nombre completo.
-- La columna "Concepto" del estado de cuenta muestra la abreviatura (tooltip = nombre).
-- Ejecutar en Supabase.
-- ============================================================================
create table if not exists account_concepts (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'charge',   -- 'charge' | 'payment'
  type_code   integer not null,
  abbr        text,
  name        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (kind, type_code)
);

-- Semilla de los conocidos
insert into account_concepts (kind, type_code, abbr, name) values
  ('charge', 1, 'ADM', 'Admission and Technology Fee'),
  ('charge', 5, 'TUI', 'Tuition')
on conflict (kind, type_code) do nothing;

-- Vista de conteos por tipo (para saber qué tipos existen en la data y cuántos)
create or replace view account_type_counts as
  select 'charge'::text as kind, charge_type as type_code, count(*)::int as n
    from account_charges where charge_type is not null group by charge_type
  union all
  select 'payment'::text as kind, payment_type as type_code, count(*)::int as n
    from account_payments where payment_type is not null group by payment_type;
