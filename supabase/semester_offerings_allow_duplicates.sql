-- ============================================================================
-- Permitir programar la misma asignatura varias veces en un semestre
-- (distintos slots/meses o grupos especiales simultáneos).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

alter table semester_offerings
  drop constraint if exists semester_offerings_semester_id_course_id_key;
