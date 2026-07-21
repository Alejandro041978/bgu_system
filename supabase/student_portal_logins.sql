-- Log de ingresos al Portal del Estudiante: una fila por canje exitoso del
-- enlace mágico (la puerta real del portal). Alimenta el reporte de accesos.
create table if not exists student_portal_logins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid,
  email text not null,
  ip text,
  user_agent text,
  logged_at timestamptz not null default now()
);
create index if not exists student_portal_logins_student_idx on student_portal_logins (student_id);
create index if not exists student_portal_logins_at_idx on student_portal_logins (logged_at desc);
