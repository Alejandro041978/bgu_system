-- ============================================================================
-- Fase 0: external_id para upsert idempotente desde SystemActiva.
-- (academic_programs_category ya tiene external_id; academic_programs ya tenía
--  su constraint academic_programs_external_id_key.) Ejecutar en Supabase.
-- ============================================================================
alter table academic_courses             add column if not exists external_id uuid;
alter table academic_students            add column if not exists external_id uuid;
alter table academic_student_enrollments add column if not exists external_id uuid;

-- IMPORTANTE: constraint único NO parcial (lo requiere ON CONFLICT del upsert).
-- Un índice único parcial (where external_id is not null) NO sirve para ON CONFLICT.
alter table academic_courses
  add constraint academic_courses_external_id_key unique (external_id);
alter table academic_students
  add constraint academic_students_external_id_key unique (external_id);
alter table academic_student_enrollments
  add constraint academic_student_enrollments_external_id_key unique (external_id);
