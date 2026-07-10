-- ============================================================================
-- Integración Flywire — cobros sobre el estado de cuenta.
--   El pago se inicia con Embedded Checkout (callback_id = account_charges.external_id).
--   El webhook Notifications v2 refleja el estado y registra el pago.
-- Ejecutar en Supabase.
-- ============================================================================

-- Estado Flywire por cuota (para verlo en el estado de cuenta)
alter table account_charges add column if not exists flywire_status text;      -- initiated|processed|guaranteed|delivered|failed|cancelled|reversed
alter table account_charges add column if not exists flywire_payment_id text;  -- id del pago en Flywire

-- Pago creado desde Flywire (idempotencia por flywire_payment_id)
alter table account_payments add column if not exists flywire_payment_id text;
create unique index if not exists account_payments_flywire_idx
  on account_payments(flywire_payment_id) where flywire_payment_id is not null;

-- Log crudo de cada notificación (auditoría / conciliación)
create table if not exists flywire_events (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         text,
  external_reference text,               -- = account_charges.external_id
  status             text,
  event_type         text,
  amount_from        numeric,
  currency_from      text,
  amount_to          numeric,
  currency_to        text,
  signature_valid    boolean,
  raw                jsonb,
  received_at        timestamptz not null default now()
);
create index if not exists flywire_events_ref_idx     on flywire_events(external_reference);
create index if not exists flywire_events_payment_idx on flywire_events(payment_id);
