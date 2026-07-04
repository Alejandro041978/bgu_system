-- ============================================================================
-- Notas de estudiantes sincronizadas desde SystemActiva (CourseRegistrations).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

create table if not exists academic_grades (
  external_id      uuid primary key,          -- CourseRegistrations.Id (upsert idempotente)
  document_number  text,                        -- enlaza con academic_students.document_number
  email            text,
  student_name     text,
  course_code      text,
  course_name      text,
  credits          integer,
  term_year        integer,
  term_block       text,
  final_grade      numeric,
  retake_grade     numeric,
  passing_score    numeric,
  group_number     integer,
  updated_at       timestamptz,
  synced_at        timestamptz not null default now()
);

create index if not exists academic_grades_document_idx on academic_grades(document_number);
create index if not exists academic_grades_email_idx on academic_grades(lower(email));
create index if not exists academic_grades_name_idx on academic_grades using gin (to_tsvector('simple', coalesce(student_name, '')));
