-- Otros ingresos: dinero que llega por Flywire y NO es de un estudiante ni de
-- un programa (venta de libros, conferencias, viajes...). Se deriva desde la
-- bandeja "Pagos Flywire sin registrar" con una categoría básica, y vive en
-- su propia página (no hay estado de cuenta que los muestre).
-- Ejecutar con "Run and enable RLS".
create table if not exists other_income (
  id uuid primary key default gen_random_uuid(),
  flywire_ref text unique,
  payer_name text,
  payer_dni text,
  amount numeric not null,
  method text,
  income_date date,
  category text not null default 'otros',   -- eventos | libros | viajes | otros
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists other_income_date_idx on other_income (income_date desc);
create index if not exists other_income_category_idx on other_income (category);
