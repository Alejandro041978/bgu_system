-- ===========================================================================
-- Carné internacional de estudiante (ISIC) — inventario e integración CCDB
--
-- ISIC nos vende BLOQUES de licencias: números de carné pre-generados que
-- nosotros vamos asignando de uno en uno. La regla que manda todo el diseño:
--   "una vez asignado un Nº de carné, no debe ser reasignado a ningún otro
--    estudiante, es intransferible".
-- Por eso el inventario es una tabla, no un contador: cada número tiene dueño,
-- y el reclamo se hace con bloqueo de fila para que dos solicitudes simultáneas
-- no se lleven el mismo.
--
-- El número trae letra de control (S034500092211K) que NO es derivable del
-- correlativo, así que los números se IMPORTAN del archivo que envía ISIC.
--
-- Ejecutar en Supabase.
-- ===========================================================================

-- ── Inventario de licencias ────────────────────────────────────────────────
create table if not exists isic_cards (
  card_number          text primary key,
  -- Staging y producción son bloques distintos y no se mezclan: un número de
  -- prueba enviado a producción sería una licencia quemada.
  environment          text not null default 'staging' check (environment in ('staging', 'production')),
  status               text not null default 'available' check (status in ('available', 'assigned', 'voided')),
  student_id           uuid references academic_students(id) on delete set null,
  document_request_id  uuid references document_requests(id) on delete set null,
  printed_name         text,
  valid_from           date,
  valid_to             date,
  isic_status          text,           -- lo que quedó en CCDB: VALID | VOIDED
  assigned_at          timestamptz,
  last_http_code       int,            -- 201 creada · 200 actualizada · 400 rechazada
  last_error           text,
  registration_url     text,           -- del GET /profile: alta en el app móvil de ISIC
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists isic_cards_disp_idx on isic_cards (environment, status, card_number);
create index if not exists isic_cards_student_idx on isic_cards (student_id);
-- Una solicitud no puede terminar con dos licencias: si se reintenta la
-- emisión, se reusa la que ya tiene.
create unique index if not exists isic_cards_request_uniq on isic_cards (document_request_id)
  where document_request_id is not null;

-- ── Bitácora de llamadas a CCDB ────────────────────────────────────────────
-- ISIC devuelve el detalle del error en el cuerpo del 400, y el manual avisa
-- que su estructura puede cambiar. Guardamos crudo lo enviado y lo recibido:
-- es la única forma de discutir un caso con su soporte.
create table if not exists isic_events (
  id                   uuid primary key default gen_random_uuid(),
  card_number          text,
  document_request_id  uuid,
  action               text not null,   -- create | revalidate | profile | photo | void
  http_code            int,
  ok                   boolean,
  request_body         text,
  response_body        text,
  created_at           timestamptz not null default now()
);

create index if not exists isic_events_card_idx on isic_events (card_number, created_at desc);

-- ── El tipo de documento que emite carné ───────────────────────────────────
-- Igual que `is_final_degree`, una marca en el tipo: al pagarse la solicitud,
-- en vez de generar un PDF por SimpleCert se emite el carné en CCDB.
alter table document_types add column if not exists isic_card boolean not null default false;

-- ── Reclamo atómico de una licencia ────────────────────────────────────────
-- FOR UPDATE SKIP LOCKED: si dos solicitudes llegan a la vez, la segunda salta
-- la fila bloqueada y toma la siguiente en vez de esperar o duplicar.
create or replace function isic_claim_card(
  p_environment text,
  p_student uuid,
  p_request uuid,
  p_printed_name text,
  p_valid_from date,
  p_valid_to date
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card text;
begin
  -- Si esta solicitud ya tiene licencia, se reusa (reintento): volver a
  -- enviarla a CCDB es idempotente y devuelve 200, pero tomar otra quemaría
  -- una licencia por cada reintento.
  select card_number into v_card from isic_cards
   where document_request_id = p_request limit 1;
  if v_card is not null then
    return v_card;
  end if;

  select card_number into v_card from isic_cards
   where environment = p_environment and status = 'available'
   order by card_number
   for update skip locked
   limit 1;

  if v_card is null then
    return null;   -- inventario agotado: quien llama lo reporta
  end if;

  update isic_cards set
    status = 'assigned', student_id = p_student, document_request_id = p_request,
    printed_name = p_printed_name, valid_from = p_valid_from, valid_to = p_valid_to,
    assigned_at = now(), updated_at = now()
  where card_number = v_card;

  return v_card;
end;
$$;

-- Devuelve una licencia al inventario. Solo se usa cuando CCDB RECHAZA la
-- creación (400): ahí es seguro afirmar que el carné no existe. Ante un error
-- de red no se libera — el carné pudo haberse creado y reasignarlo lo
-- duplicaría.
create or replace function isic_release_card(p_card text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update isic_cards set
    status = 'available', student_id = null, document_request_id = null,
    printed_name = null, valid_from = null, valid_to = null, assigned_at = null,
    updated_at = now()
  where card_number = p_card and status = 'assigned';
end;
$$;

-- Con "Automatically expose new tables" apagado, cada tabla nueva necesita
-- permiso explícito para el rol que usa el ERP.
grant all on table isic_cards to service_role;
grant all on table isic_events to service_role;
grant execute on function isic_claim_card(text, uuid, uuid, text, date, date) to service_role;
grant execute on function isic_release_card(text) to service_role;

-- RLS cerrado: nadie entra por la API pública. El ERP lee y escribe con
-- service_role desde las rutas, que es donde vive la autorización.
alter table isic_cards enable row level security;
alter table isic_events enable row level security;

-- ===========================================================================
-- Datos iniciales
-- ===========================================================================

-- El tipo de documento que emite carné (ya existía como trámite manual).
update document_types set isic_card = true, updated_at = now()
 where name = 'International Student Card';

-- Bloque de 100 licencias de PRUEBA que envió ISIC para staging.
-- Dos de ellas (S034500092309K y S034500092310T) ya existen en la CCDB de
-- staging porque se usaron para validar la integración; reenviarlas devolverá
-- 200 en vez de 201. La primera emisión real tomará S034500092211K.
insert into isic_cards (card_number, environment, status) values
  ('S034500092211K', 'staging', 'available'),
  ('S034500092212X', 'staging', 'available'),
  ('S034500092213N', 'staging', 'available'),
  ('S034500092214Q', 'staging', 'available'),
  ('S034500092215J', 'staging', 'available'),
  ('S034500092216K', 'staging', 'available'),
  ('S034500092217L', 'staging', 'available'),
  ('S034500092218C', 'staging', 'available'),
  ('S034500092219F', 'staging', 'available'),
  ('S034500092220N', 'staging', 'available'),
  ('S034500092221G', 'staging', 'available'),
  ('S034500092222R', 'staging', 'available'),
  ('S034500092223T', 'staging', 'available'),
  ('S034500092224A', 'staging', 'available'),
  ('S034500092225M', 'staging', 'available'),
  ('S034500092226N', 'staging', 'available'),
  ('S034500092227F', 'staging', 'available'),
  ('S034500092228H', 'staging', 'available'),
  ('S034500092229U', 'staging', 'available'),
  ('S034500092230H', 'staging', 'available'),
  ('S034500092231U', 'staging', 'available'),
  ('S034500092232M', 'staging', 'available'),
  ('S034500092233C', 'staging', 'available'),
  ('S034500092234F', 'staging', 'available'),
  ('S034500092235R', 'staging', 'available'),
  ('S034500092236J', 'staging', 'available'),
  ('S034500092237K', 'staging', 'available'),
  ('S034500092238N', 'staging', 'available'),
  ('S034500092239N', 'staging', 'available'),
  ('S034500092240N', 'staging', 'available'),
  ('S034500092241N', 'staging', 'available'),
  ('S034500092242F', 'staging', 'available'),
  ('S034500092243H', 'staging', 'available'),
  ('S034500092244K', 'staging', 'available'),
  ('S034500092245L', 'staging', 'available'),
  ('S034500092246N', 'staging', 'available'),
  ('S034500092247F', 'staging', 'available'),
  ('S034500092248R', 'staging', 'available'),
  ('S034500092249T', 'staging', 'available'),
  ('S034500092250H', 'staging', 'available'),
  ('S034500092251J', 'staging', 'available'),
  ('S034500092252K', 'staging', 'available'),
  ('S034500092253M', 'staging', 'available'),
  ('S034500092254N', 'staging', 'available'),
  ('S034500092255Q', 'staging', 'available'),
  ('S034500092256H', 'staging', 'available'),
  ('S034500092257U', 'staging', 'available'),
  ('S034500092258W', 'staging', 'available'),
  ('S034500092259D', 'staging', 'available'),
  ('S034500092260L', 'staging', 'available'),
  ('S034500092261N', 'staging', 'available'),
  ('S034500092262F', 'staging', 'available'),
  ('S034500092263R', 'staging', 'available'),
  ('S034500092264T', 'staging', 'available'),
  ('S034500092265K', 'staging', 'available'),
  ('S034500092266X', 'staging', 'available'),
  ('S034500092267F', 'staging', 'available'),
  ('S034500092268F', 'staging', 'available'),
  ('S034500092269H', 'staging', 'available'),
  ('S034500092270Q', 'staging', 'available'),
  ('S034500092271H', 'staging', 'available'),
  ('S034500092272U', 'staging', 'available'),
  ('S034500092273M', 'staging', 'available'),
  ('S034500092274N', 'staging', 'available'),
  ('S034500092275G', 'staging', 'available'),
  ('S034500092276G', 'staging', 'available'),
  ('S034500092277J', 'staging', 'available'),
  ('S034500092278K', 'staging', 'available'),
  ('S034500092279M', 'staging', 'available'),
  ('S034500092280K', 'staging', 'available'),
  ('S034500092281X', 'staging', 'available'),
  ('S034500092282N', 'staging', 'available'),
  ('S034500092283G', 'staging', 'available'),
  ('S034500092284H', 'staging', 'available'),
  ('S034500092285J', 'staging', 'available'),
  ('S034500092286L', 'staging', 'available'),
  ('S034500092287N', 'staging', 'available'),
  ('S034500092288F', 'staging', 'available'),
  ('S034500092289R', 'staging', 'available'),
  ('S034500092290Q', 'staging', 'available'),
  ('S034500092291H', 'staging', 'available'),
  ('S034500092292J', 'staging', 'available'),
  ('S034500092293K', 'staging', 'available'),
  ('S034500092294M', 'staging', 'available'),
  ('S034500092295N', 'staging', 'available'),
  ('S034500092296G', 'staging', 'available'),
  ('S034500092297H', 'staging', 'available'),
  ('S034500092298U', 'staging', 'available'),
  ('S034500092299L', 'staging', 'available'),
  ('S034500092300N', 'staging', 'available'),
  ('S034500092301Q', 'staging', 'available'),
  ('S034500092302H', 'staging', 'available'),
  ('S034500092303U', 'staging', 'available'),
  ('S034500092304W', 'staging', 'available'),
  ('S034500092305D', 'staging', 'available'),
  ('S034500092306F', 'staging', 'available'),
  ('S034500092307H', 'staging', 'available'),
  ('S034500092308J', 'staging', 'available'),
  ('S034500092309K', 'staging', 'available'),
  ('S034500092310T', 'staging', 'available')
on conflict (card_number) do nothing;
