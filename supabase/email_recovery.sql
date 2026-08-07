-- ===========================================================================
-- Recuperación del correo institucional por autoservicio
--   https://system.blackwell.university/form/recoverymail
--
-- Esta página EMITE CREDENCIALES de un buzón. Es tan sensible como el buzón
-- mismo, porque quien lo controle recibirá todo lo que mandemos ahí después.
-- De ahí que cada intento quede registrado: es una superficie de secuestro de
-- cuentas y hay que poder auditarla cuando alguien pregunte qué pasó.
--
-- El código NO se guarda: se guarda su hash. Una bitácora que contiene los
-- códigos vivos es una llave maestra para quien lea la base.
-- ===========================================================================

create table if not exists email_recovery_requests (
  id           uuid primary key default gen_random_uuid(),
  document     text not null,              -- lo que tecleó, exista o no
  student_id   uuid references academic_students(id) on delete set null,
  code_hash    text,                       -- sha256 del código; null si no se envió
  channel      text,                       -- 'email' | 'whatsapp'
  channel_hint text,                       -- destino ENMASCARADO, para mostrarlo
  attempts     integer not null default 0, -- intentos de código fallidos
  expires_at   timestamptz,
  verified_at  timestamptz,
  outcome      text,                       -- que pasó al final (reset, derivado, …)
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

-- Los topes se consultan por documento y por IP en una ventana reciente.
create index if not exists email_recovery_doc_idx on email_recovery_requests (document, created_at desc);
create index if not exists email_recovery_ip_idx  on email_recovery_requests (ip, created_at desc);

-- RLS cerrado: se entra por la ruta del ERP con service_role. La página es
-- pública, pero la tabla no: sin esto, cualquiera con la anon key leería los
-- documentos que se han intentado.
alter table email_recovery_requests enable row level security;

grant all on table email_recovery_requests to service_role;
