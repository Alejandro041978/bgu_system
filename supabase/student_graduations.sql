-- ============================================================================
-- Egresados detectados automáticamente.
--   Un cron diario marca al estudiante que cubrió el 100% de las asignaturas
--   obligatorias de un programa (nota aprobatoria, convalidación o validación).
--   Ser egresado sirve para tres cosas:
--     1) excluirlo de la campaña de retención (no es un desertor),
--     2) estadística institucional,
--     3) ofrecerle iniciar su titulación (es voluntaria) → titulacion_status.
--
--   Es una tabla y no un campo porque el egreso es POR PROGRAMA: alguien puede
--   egresar de un bachelor y seguir cursando una maestría.
-- Ejecutar en Supabase (activar RLS: sólo se accede con service role).
-- ============================================================================
create table if not exists student_graduations (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references academic_students(id),
  program_id       uuid not null references academic_programs(id),
  detected_at      date not null default current_date,
  courses_total    integer,
  courses_covered  integer,
  titulacion_status text not null default 'pendiente'
    check (titulacion_status in ('pendiente', 'ofrecido', 'iniciado', 'titulado', 'rechazado')),
  created_at       timestamptz not null default now(),
  unique (student_id, program_id)
);
create index if not exists student_graduations_student_idx on student_graduations(student_id);
create index if not exists student_graduations_titulacion_idx on student_graduations(titulacion_status);

-- Asignatura obligatoria para egresar (= Courses.GraduationRequirement de
-- SystemActiva). NULL = se asume obligatoria (comportamiento actual).
alter table academic_courses add column if not exists graduation_requirement boolean;
