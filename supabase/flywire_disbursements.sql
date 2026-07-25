-- Desembolsos de Flywire (2026-07-25) — los ABONOS agregados que Flywire hace a
-- la cuenta corriente (agrupa varios pagos en un solo depósito). NO son pagos
-- ni reembolsos (esos tienen sus propios caminos). Sirven para CONCILIAR contra
-- las operaciones importadas de Zoho Books (los depósitos vistos desde el banco):
-- el que cruza por monto+fecha marca la operación de Books como 'conciliada'.
-- Ejecutar con "Run and enable RLS".
create table if not exists flywire_disbursements (
  id                   uuid primary key default gen_random_uuid(),
  disbursement_id      text not null unique,          -- id del desembolso en Flywire
  disbursement_date    date,
  amount               numeric not null,
  currency             text,
  raw                  jsonb,
  matched_operation_id uuid,                           -- books_operations.id si cruzó
  imported_by          text,
  imported_at          timestamptz not null default now()
);
create index if not exists flywire_disbursements_date_idx on flywire_disbursements (disbursement_date);

-- Enlace desde la operación de Books al desembolso que la explica
alter table books_operations add column if not exists flywire_disbursement_id text;
