-- ============================================================================
-- Fase 2 Moodle: cada asignatura ofertada se mapea a un curso (aula) de Moodle.
-- Ejecutar en Supabase.
-- ============================================================================
alter table semester_offerings add column if not exists moodle_course_id text;
