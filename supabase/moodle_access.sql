-- Restricción de acceso a Moodle por deuda vencida.
-- El estudiante entra directo a Moodle (auth manual), así que la restricción se
-- aplica SUSPENDIENDO su cuenta vía API. Un estudiante con cuotas vencidas queda
-- bloqueado, salvo que tenga una EXCEPCIÓN temporal vigente. Ejecutar en Supabase.

-- Excepciones temporales: "N días de gracia" pese a la deuda.
create table if not exists moodle_access_exceptions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references academic_students(id) on delete cascade,
  granted_by  text,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz not null,      -- fin de la excepción (inclusive hasta esa fecha/hora)
  days        int,                        -- días otorgados (referencial)
  note        text
);
create index if not exists mae_student_idx on moodle_access_exceptions (student_id);
create index if not exists mae_expires_idx on moodle_access_exceptions (expires_at);

-- Estado cacheado de la cuenta Moodle (para no llamar la API en balde): true = la
-- suspendió NUESTRO motor por deuda. Nunca tocamos cuentas suspendidas a mano.
alter table academic_students add column if not exists moodle_suspended boolean not null default false;
alter table academic_students add column if not exists moodle_suspended_at timestamptz;
