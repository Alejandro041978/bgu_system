-- ===========================================================================
-- CASHPAY — beneficio por adelantar cuotas futuras
--
-- Regla (definida por el usuario, 2026-07-29):
--   meses    = meses EXACTOS (con decimales) entre hoy y el vencimiento de la
--              cuota MÁS LEJANA que se adelanta
--   descuento% = meses × tasa_mensual (0.8), con tope 20%
--   ahorro   = suma de las cuotas adelantadas × descuento%
--
-- Se descuenta por TIEMPO ANTICIPADO, no por número de cuotas: un plan semanal
-- y uno mensual que cubren el mismo horizonte reciben el mismo beneficio.
--
-- Elegibilidad: SOLO estudiantes al día. El beneficio adelanta cuotas futuras,
-- no perdona atrasos.
-- Flujo: el estudiante simula y SOLICITA; cobranza aprueba; recién ahí se
-- aplica el descuento. El descuento es dinero: no sale de un clic del alumno.
-- ===========================================================================

-- Configuración VERSIONADA e inmutable (como el tarifario por crédito): al
-- cambiar los porcentajes, las solicitudes ya cotizadas conservan su versión.
create table if not exists cashpay_settings (
  id              uuid primary key default gen_random_uuid(),
  monthly_rate    numeric not null default 0.8,    -- % por mes de anticipación
  max_discount    numeric not null default 20,     -- tope del descuento (%)
  min_months      numeric not null default 0,      -- mínimo para acceder (0 = sin mínimo)
  quote_valid_days int    not null default 7,      -- caducidad de la cotización
  effective_from  date    not null default current_date,
  active          boolean not null default true,
  note            text,
  created_at      timestamptz not null default now(),
  created_by      text
);
create index if not exists cashpay_settings_active_idx on cashpay_settings (active, effective_from desc);

insert into cashpay_settings (monthly_rate, max_discount, min_months, quote_valid_days, note, created_by)
select 0.8, 20, 0, 7, 'Versión inicial', 'sistema'
where not exists (select 1 from cashpay_settings);

-- Solicitudes del estudiante (cotización congelada + decisión de cobranza)
create table if not exists cashpay_requests (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references academic_students(id) on delete cascade,
  charges       jsonb not null,                 -- external_id de las cuotas adelantadas
  months        numeric not null,               -- meses de anticipación (exactos)
  discount_pct  numeric not null,               -- % aplicado (ya con tope)
  gross_amount  numeric not null,               -- suma de las cuotas
  discount_amount numeric not null,             -- ahorro
  net_amount    numeric not null,               -- lo que pagaría
  settings_id   uuid references cashpay_settings(id),  -- versión con la que se cotizó
  status        text not null default 'pendiente'
                check (status in ('pendiente','aprobada','rechazada','anulada')),
  requested_at  timestamptz not null default now(),
  expires_at    timestamptz,
  reviewed_by   text,
  reviewed_at   timestamptz,
  review_note   text,
  applied_at    timestamptz                     -- cuándo se aplicó el descuento
);
create index if not exists cashpay_req_student_idx on cashpay_requests (student_id);
create index if not exists cashpay_req_status_idx  on cashpay_requests (status);
