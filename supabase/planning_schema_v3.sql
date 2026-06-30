-- Acción por Responsable pasa a ser una entidad propia (código, nombre, año)
-- Ejecutar en Supabase SQL editor (Run without RLS)

alter table strategic_action_responsibles
  add column if not exists code text,
  add column if not exists name text;
