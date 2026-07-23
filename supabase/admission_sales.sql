-- Ventas de admisión y comisiones (2026-07-23).
-- Cada matrícula de una convocatoria es una VENTA: se asigna a una asesora de
-- admisión con un TIPO de admisión (interna/externa/convenio..., configurable
-- por categoría de programa) y cada tipo tiene su comisión en USD. La comisión
-- se CONGELA al asignar (snapshot): cambiarla después no mueve lo ya asignado.
-- Ejecutar con "Run and enable RLS".
create table if not exists admission_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null,
  name text not null,
  commission numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists admission_types_cat_idx on admission_types (category_id);

create table if not exists admission_sales (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique,
  advisor_id uuid,                       -- hr_employees.id
  admission_type_id uuid,
  commission_amount numeric,             -- snapshot al asignar el tipo
  assigned_at timestamptz not null default now(),
  assigned_by text
);
create index if not exists admission_sales_advisor_idx on admission_sales (advisor_id);
