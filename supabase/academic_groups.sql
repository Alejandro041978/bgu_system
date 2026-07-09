-- ============================================================================
-- GRUPOS ACADÉMICOS (consolidado, estado final).
-- El grupo pertenece a un PROGRAMA (no a semestre/año). Agrupa asignaturas
-- ofertadas (semester_offerings) y estudiantes, y (Fase 2) se conecta a Moodle.
-- Ejecutar en Supabase (idempotente). Reemplaza los scripts previos de grupos.
-- ============================================================================
create table if not exists academic_groups (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid references academic_programs(id),
  category_id      uuid references academic_programs_category(id),
  abbreviation     text,   -- abreviatura
  name             text,   -- denominación
  detail           text,   -- detalle
  moodle_cohort_id text,   -- Fase 2
  created_at       timestamptz not null default now()
);

-- Una asignatura ofertada pertenece a un grupo y (Fase 2) mapea a un aula Moodle
alter table semester_offerings add column if not exists group_id uuid references academic_groups(id);
alter table semester_offerings add column if not exists moodle_course_id text;
create index if not exists semester_offerings_group_idx on semester_offerings(group_id);

-- Membresía estudiante ↔ grupo (dispara el aprovisionamiento en Moodle)
create table if not exists academic_group_students (
  group_id    uuid references academic_groups(id) on delete cascade,
  student_id  uuid references academic_students(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (group_id, student_id)
);
create index if not exists academic_group_students_student_idx on academic_group_students(student_id);

-- Identidad Moodle del estudiante (Fase 2)
alter table academic_students add column if not exists moodle_user_id text;
