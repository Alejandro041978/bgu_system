-- Presencia en el Portal del Estudiante: el portal envía un latido cada
-- minuto mientras está abierto; "conectado ahora" = latido en los últimos
-- 3 minutos. Una fila por estudiante (se actualiza, no se acumula).
create table if not exists student_portal_presence (
  student_id uuid primary key,
  email text not null,
  last_seen timestamptz not null default now()
);
create index if not exists student_portal_presence_seen_idx on student_portal_presence (last_seen desc);
