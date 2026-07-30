-- ===========================================================================
-- Trámites del estudiante
--
-- Mismo circuito que exámenes y documentos: el estudiante lo pide → se le carga
-- al estado de cuenta → paga → un administrativo lo atiende.
--
-- Estados: iniciado → pagado → atendido, y `anulado` desde cualquiera de los
-- dos primeros. Se guarda como catálogo (no un enum de trámites en el código)
-- porque el primero es "Re-entry" pero vendrán más, y darlos de alta no debería
-- requerir un despliegue.
--
-- Ejecutar en Supabase.
-- ===========================================================================

create table if not exists tramite_types (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  price          numeric not null default 0,
  currency       text not null default 'USD',
  -- type_code de account_concepts: con qué concepto se carga a la cuenta.
  charge_concept int,
  -- Texto que el estudiante DEBE escribir al solicitar (motivo, período…).
  -- Nulo = no se le pide nada.
  request_note_label text,
  instructions   text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists tramite_requests (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references academic_students(id) on delete cascade,
  tramite_type_id uuid not null references tramite_types(id),
  program_id     uuid,
  status         text not null default 'iniciado'
                 check (status in ('iniciado', 'pagado', 'atendido', 'anulado')),
  -- Cuota generada en el estado de cuenta. Es la llave con la que el gatillo de
  -- pago encuentra el trámite (igual que en exámenes y documentos).
  charge_external_id text,
  request_note   text,
  requested_by   text,
  requested_at   timestamptz not null default now(),
  paid_at        timestamptz,
  attended_at    timestamptz,
  attended_by    text,
  -- Qué resolvió el administrativo: es el registro de la atención, no un
  -- comentario suelto.
  resolution_note text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists tramite_requests_student_idx on tramite_requests (student_id);
create index if not exists tramite_requests_status_idx on tramite_requests (status, requested_at desc);
-- El gatillo de pago busca por la cuota: sin este índice recorrería la tabla.
create index if not exists tramite_requests_charge_idx on tramite_requests (charge_external_id)
  where charge_external_id is not null;

-- Con "Automatically expose new tables" apagado, cada tabla nueva necesita
-- permiso explícito para el rol que usa el ERP.
grant all on table tramite_types to service_role;
grant all on table tramite_requests to service_role;

-- RLS cerrado: nadie entra por la API pública. El ERP lee y escribe con
-- service_role desde las rutas, que es donde vive la autorización — y los
-- estudiantes TIENEN sesión de Supabase, así que abrir a `authenticated` les
-- daría los trámites de todos.
alter table tramite_types enable row level security;
alter table tramite_requests enable row level security;

-- ── El primer trámite ──────────────────────────────────────────────────────
-- El concepto 22 (Re-entry) ya existe en account_concepts.
insert into tramite_types (name, description, price, currency, charge_concept, request_note_label, instructions)
select 'Re-entry', 'Reingreso a un programa de estudios tras una interrupción.', 30, 'USD', 22,
       '¿Desde cuándo estás fuera y a qué programa quieres reingresar?',
       'Al pagar, Registros revisa tu situación académica y financiera y te confirma la reincorporación.'
 where not exists (select 1 from tramite_types where name = 'Re-entry');
