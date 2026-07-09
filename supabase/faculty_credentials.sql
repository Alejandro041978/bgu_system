-- ============================================================================
-- Credenciales de idoneidad docente (evaluación con IA vía AACRAO EDGE).
-- Una por colaborador (employee_id único). Ejecutar en Supabase.
-- ============================================================================
create table if not exists faculty_credentials (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid references hr_employees(id) on delete cascade,
  cv_url              text,
  cv_name             text,
  degree_url          text,
  degree_name         text,
  second_title_url    text,
  second_title_name   text,
  status              text not null default 'pending',   -- pending | evaluating | approved | rejected
  approved_level      text,                               -- bachelor | master | doctor | null
  ai_report           text,
  evaluated_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint faculty_credentials_employee_id_key unique (employee_id)
);
