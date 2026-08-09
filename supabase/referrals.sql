-- ===========================================================================
-- Free Degree: referidos del estudiante.
--
-- El estudiante registra amigos desde su portal, el lead nace en el embudo de
-- Antonella, y por cada referido que llega a PAGAR su Enrollment el estudiante
-- gana 100 USD de credito contra el cargo de Degree (400 USD, el derecho de
-- titulacion). Cuatro referidos inscritos y la titulacion le sale gratis.
--
-- El credito NO se guarda aqui: se calcula. Ganado = referidos inscritos x 100;
-- aplicado = los descuentos que ya se pusieron sobre su cargo de Degree. Un
-- saldo guardado se desincroniza el dia que se revierta un pago, y nadie lo
-- nota hasta que alguien reclama.
-- ===========================================================================

create table if not exists referrals (
  id                   uuid primary key default gen_random_uuid(),
  referrer_student_id  uuid not null references academic_students(id) on delete cascade,

  -- Datos del referido. Telefono en dos piezas, como el resto del ERP: es la
  -- llave de conversacion de Antonella y componerlo a mano ya nos costo 74
  -- envios fallidos.
  first_name           text not null,
  last_name            text,
  email                text not null,
  phone_code           text not null,
  phone_local          text not null,
  phone_number         text,
  program_id           uuid references academic_programs(id),

  -- Datos de un tercero que no nos los dio: el estudiante declara que tiene
  -- permiso, y queda con fecha.
  consent_at           timestamptz not null,

  -- registrado  → nace, va al embudo
  -- del_equipo  → ya lo trabajaba Admision: no genera credito
  -- duplicado   → otro estudiante lo refirio antes
  -- El resto de estados (contactado, en conversacion, inscrito) NO se guardan:
  -- se derivan de la etapa del lead y del pago del Enrollment.
  status               text not null default 'registrado'
                       check (status in ('registrado','del_equipo','duplicado')),

  lead_id              uuid references sales_leads(id) on delete set null,
  -- Se rellena cuando el referido aparece como estudiante nuestro.
  enrolled_student_id  uuid references academic_students(id) on delete set null,
  qualified_at         timestamptz,          -- cuando pago su Enrollment

  -- Rastro de la decision automatica sobre un lead que ya existia.
  lead_previo          boolean not null default false,
  lead_previo_nota     text,
  avisado_admision_at  timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz
);

create index if not exists referrals_referrer_idx on referrals (referrer_student_id);
create index if not exists referrals_lead_idx     on referrals (lead_id);
create index if not exists referrals_status_idx   on referrals (status);

-- Gana el primero que lo registra. Un referido que quedo en 'duplicado' no
-- bloquea, porque nunca fue de nadie.
create unique index if not exists referrals_email_unico
  on referrals (lower(email)) where status <> 'duplicado';
create unique index if not exists referrals_phone_unico
  on referrals (phone_number) where status <> 'duplicado' and phone_number is not null;

alter table referrals enable row level security;
grant all on table referrals to service_role;

-- ── Bitrix24 ────────────────────────────────────────────────────────────────
-- El CRM donde trabaja el equipo de admision. Cuando el referido pasa al
-- estudiante y no existia alli, se le crea contacto y negociacion a nombre del
-- usuario "Bot Bitrix": sin eso, ese mismo prospecto puede entrar manana por
-- otra via y un asesor lo trabaja sin saber que ya lo estan atendiendo.
alter table referrals add column if not exists bitrix_contact_id bigint;
alter table referrals add column if not exists bitrix_deal_id    bigint;
create index if not exists referrals_bitrix_deal_idx on referrals (bitrix_deal_id);
