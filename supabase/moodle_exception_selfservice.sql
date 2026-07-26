-- Autoservicio de "Excepción Temporal Deuda" desde el portal del estudiante.
-- El estudiante con deuda pide 3 o 5 días de gracia con una justificación; un bot
-- la evalúa y decide. Se distingue el ORIGEN (asesor vs estudiante). Ejecutar en Supabase.

-- Origen y justificación en las excepciones ya existentes.
alter table moodle_access_exceptions add column if not exists source text not null default 'asesor'; -- 'asesor' | 'estudiante'
alter table moodle_access_exceptions add column if not exists justification text;

-- Bitácora de solicitudes de autoservicio (incluye las RECHAZADas por el bot).
create table if not exists moodle_exception_requests (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references academic_students(id) on delete cascade,
  days            int not null,
  justification   text not null,
  decision        text not null,             -- 'aceptada' | 'rechazada'
  decision_reason text,                       -- explicación del bot
  exception_id    uuid,                       -- excepción creada si fue aceptada
  created_at      timestamptz not null default now()
);
create index if not exists mer_student_idx on moodle_exception_requests (student_id);
create index if not exists mer_created_idx on moodle_exception_requests (created_at);
