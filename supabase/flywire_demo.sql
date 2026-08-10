-- ============================================================================
-- Buzón de pruebas de Flywire (entorno Demo).
--
-- El portal Demo notifica con la MISMA clave y el mismo formato que el de
-- Producción: por el cuerpo de la notificación los dos entornos son
-- indistinguibles. Si ambos entran por el mismo webhook, un pago de mentira
-- hecho con el documento de un estudiante real se empareja solo, le deja una
-- cuota pagada, le activa la matrícula y le devuelve el acceso a Moodle.
--
-- Por eso el entorno se separa por URL —lo único que sí controlamos— y las
-- pruebas caen en su propia tabla. Así ninguna consulta de finanzas (sin
-- conciliar, otros ingresos, reintegros, reproceso) las ve siquiera.
--
-- Ejecutar en Supabase.
-- ============================================================================

create table if not exists flywire_events_demo (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         text,
  external_reference text,
  status             text,
  event_type         text,
  amount_from        numeric,
  currency_from      text,
  amount_to          numeric,
  currency_to        text,
  signature_valid    boolean,
  signature_key      text,
  raw                jsonb,
  received_at        timestamptz not null default now()
);
create index if not exists flywire_events_demo_payment_idx on flywire_events_demo(payment_id);
create index if not exists flywire_events_demo_at_idx      on flywire_events_demo(received_at desc);

-- RLS cerrado: nadie llega por PostgREST con sesión de usuario.
alter table flywire_events_demo enable row level security;
grant all on flywire_events_demo to service_role;

comment on table flywire_events_demo is
  'Notificaciones del entorno Demo de Flywire. Solo registro: nunca tocan cuotas ni pagos.';
