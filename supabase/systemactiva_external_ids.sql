-- ============================================================================
-- Fase 0: external_id para upsert idempotente desde SystemActiva.
-- (academic_programs_category ya tiene external_id.) Ejecutar en Supabase.
-- ============================================================================
alter table academic_programs            add column if not exists external_id uuid;
alter table academic_courses             add column if not exists external_id uuid;
alter table academic_students            add column if not exists external_id uuid;
alter table academic_student_enrollments add column if not exists external_id uuid;

create unique index if not exists academic_programs_extid_uidx
  on academic_programs(external_id) where external_id is not null;
create unique index if not exists academic_courses_extid_uidx
  on academic_courses(external_id) where external_id is not null;
create unique index if not exists academic_students_extid_uidx
  on academic_students(external_id) where external_id is not null;
create unique index if not exists academic_student_enrollments_extid_uidx
  on academic_student_enrollments(external_id) where external_id is not null;
