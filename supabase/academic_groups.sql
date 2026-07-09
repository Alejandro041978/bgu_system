-- ============================================================================
-- Grupos académicos (Fase 1). Un grupo agrupa asignaturas ofertadas (semester_offerings)
-- y estudiantes. En Fase 2 cada grupo se conectará a Moodle (moodle_cohort_id) y sus
-- asignaturas a aulas (semester_offerings.moodle_course_id). Ejecutar en Supabase.
-- ============================================================================
create table if not exists academic_groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  semester_id      uuid references academic_semesters(id),
  category_id      uuid references academic_programs_category(id),
  program_id       uuid references academic_programs(id),
  moodle_cohort_id text,                                          -- Fase 2
  created_at       timestamptz not null default now()
);

-- Una asignatura ofertada pertenece a un grupo
alter table semester_offerings add column if not exists group_id uuid references academic_groups(id);
create index if not exists semester_offerings_group_idx on semester_offerings(group_id);

-- Membresía estudiante ↔ grupo (dispara el aprovisionamiento en Fase 2)
create table if not exists academic_group_students (
  group_id    uuid references academic_groups(id) on delete cascade,
  student_id  uuid references academic_students(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (group_id, student_id)
);
create index if not exists academic_group_students_student_idx on academic_group_students(student_id);

-- Identidad Moodle del estudiante (Fase 2)
alter table academic_students add column if not exists moodle_user_id text;
