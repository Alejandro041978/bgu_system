-- ============================================================================
-- Detalle de calificaciones (de SystemActiva CourseRegistrations + TermCourses).
-- Por cada curso del estudiante: nota final/recuperación/subsanación + el desglose
-- de notas principales (Grade1..10) y de proceso (ProcessGrade1..30), cada una con
-- su descripción y peso%. Ejecutar en Supabase.
-- ============================================================================
create table if not exists academic_grade_details (
  id             uuid primary key default gen_random_uuid(),
  external_id    uuid not null,                                     -- = CourseRegistration.Id
  student_id     uuid references academic_students(id),
  enrollment_id  uuid references academic_student_enrollments(id),
  course_code    text,
  course_name    text,
  term_year      integer,
  term_block     text,
  final_grade    numeric,
  retake_grade   numeric,
  makeup_grade   numeric,
  extra_points   numeric,
  passing_score  numeric,
  max_score      numeric,
  grades         jsonb,   -- [{n, desc, pct, val}] notas principales
  process_grades jsonb,   -- [{n, desc, pct, val}] notas de proceso
  created_at     timestamptz not null default now(),
  constraint academic_grade_details_external_id_key unique (external_id)
);
create index if not exists academic_grade_details_student_idx on academic_grade_details(student_id);
