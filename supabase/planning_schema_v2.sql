-- Agrega nivel "Acción por Responsable" con su propio estado/avance
-- Ejecutar en Supabase SQL editor (Run without RLS)

alter table strategic_action_responsibles
  add column if not exists status text not null default 'active', -- active | completed | at_risk | overdue | cancelled
  add column if not exists progress_pct numeric default 0,
  add column if not exists notes text;
