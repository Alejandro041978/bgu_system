-- Tarifario OFICIAL por crédito (precios regulados, 2026-07-23).
-- Los precios NO se editan: cada cambio es una VERSIÓN nueva con vigencia
-- desde su publicación (effective_from) — así siempre se puede evidenciar qué
-- precio estaba publicado en cualquier fecha. Resolución: tarifa del PROGRAMA
-- si existe; si no, la de su CATEGORÍA (la vigente a la fecha consultada).
-- Ejecutar con "Run and enable RLS".
create table if not exists credit_rates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid,                      -- tarifa general de la categoría…
  program_id uuid,                       -- …o específica del producto (manda)
  price_per_credit numeric not null,
  currency text not null default 'USD',
  effective_from date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  created_by text,
  constraint credit_rates_scope check ((category_id is null) <> (program_id is null))
);
create index if not exists credit_rates_cat_idx on credit_rates (category_id, effective_from desc);
create index if not exists credit_rates_prog_idx on credit_rates (program_id, effective_from desc);

-- Snapshot en la matrícula: la tarifa vigente al matricularse se CONGELA con
-- el estudiante (los precios futuros no lo alcanzan).
alter table academic_student_enrollments add column if not exists credit_rate numeric;
alter table academic_student_enrollments add column if not exists credit_rate_source text;  -- 'programa' | 'categoria'
alter table academic_student_enrollments add column if not exists list_price numeric;       -- tarifa × créditos del programa
