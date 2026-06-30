-- Separa "qué se debe hacer" (plan) de "cómo fue el avance cada año" (reporte)
-- Ejecutar en Supabase SQL editor (Run without RLS)

create table if not exists strategic_responsible_progress (
  id uuid primary key default gen_random_uuid(),
  responsible_id uuid not null references strategic_action_responsibles(id) on delete cascade,
  year int not null,
  status text not null default 'not_started', -- not_started | active | completed | at_risk | overdue | cancelled
  progress_pct numeric default 0,
  notes text,
  reported_by uuid references hr_employees(id),
  reported_at timestamptz not null default now(),
  unique(responsible_id, year)
);

create index if not exists idx_progress_responsible on strategic_responsible_progress(responsible_id);
create index if not exists idx_progress_year on strategic_responsible_progress(year);
