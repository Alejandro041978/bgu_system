-- Años en los que debe ejecutarse cada Acción por Responsable.
-- El reporte de avance solo debe permitirse para estos años.
-- Ejecutar en Supabase SQL editor (Run without RLS)

create table if not exists strategic_responsible_years (
  id uuid primary key default gen_random_uuid(),
  responsible_id uuid not null references strategic_action_responsibles(id) on delete cascade,
  year int not null,
  unique(responsible_id, year)
);

create index if not exists idx_resp_years_responsible on strategic_responsible_years(responsible_id);
