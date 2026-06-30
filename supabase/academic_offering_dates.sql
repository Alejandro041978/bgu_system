-- Fecha de inicio y término de cada asignatura ofertada en un semestre
-- Ejecutar en Supabase SQL editor (Run without RLS)

alter table semester_offerings
  add column if not exists start_date date,
  add column if not exists end_date date;
