-- ============================================================================
-- Horas por asignatura (para totales de horas en documentos/certificados).
-- Ejecutar en Supabase.
-- ============================================================================
alter table academic_courses add column if not exists hours integer;
