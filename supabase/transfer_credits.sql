-- ============================================================================
-- Módulo de Convalidaciones (Transfer Credit)
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

-- 1) Escalas de conversión (tablas gestionables en página independiente).
--    Cada convalidación (individual o masiva) elige la escala de su preferencia.
create table if not exists grade_scales (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,            -- "Perú 0–20", "Chile 1–7", "México 1–10"
  country        text,
  origin_min     numeric not null,
  origin_max     numeric not null,
  origin_passing numeric not null,         -- nota mínima aprobatoria del país de origen
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- 2) Nuestra nota de aprobación por categoría de programa (Master/Bachelor/Doctorado…).
--    El destino ancla la conversión a 100 usando esta nota según la categoría del programa.
alter table academic_programs_category add column if not exists passing_score numeric;

-- 3) Cabecera de convalidación (por estudiante).
create table if not exists transfer_credits (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid,                 -- academic_students.id
  student_document   text,                 -- respaldo para enlazar con academic_grades
  student_name       text,
  origin_institution text not null,
  origin_program     text,
  dest_program_id    uuid,                 -- academic_programs.id (programa de destino)
  scale_id           uuid references grade_scales(id),   -- escala de conversión elegida
  scheme_id          uuid,                 -- transfer_schemes.id si vino de masivo (nullable)
  status             text not null default 'active',     -- active | closed
  notes              text,
  created_by         uuid,
  created_at         timestamptz not null default now()
);
create index if not exists transfer_credits_student_idx on transfer_credits(student_id);
create index if not exists transfer_credits_document_idx on transfer_credits(student_document);

-- 4) Ítems: asignatura de origen → asignatura de destino (1 a 1).
--    origin_grade / converted_grade son NULLABLE (en masivo se llenan luego, 1 a 1).
create table if not exists transfer_credit_items (
  id                 uuid primary key default gen_random_uuid(),
  transfer_credit_id uuid not null references transfer_credits(id) on delete cascade,
  origin_course_name text not null,
  dest_course_id     uuid,                 -- academic_courses.id (asignatura de destino)
  dest_course_name   text,                 -- snapshot legible
  origin_grade       numeric,              -- nota en la institución de origen (nullable)
  converted_grade    numeric,              -- nota convertida 0–100 (nullable, calculada)
  created_at         timestamptz not null default now()
);
create index if not exists transfer_credit_items_parent_idx on transfer_credit_items(transfer_credit_id);

-- 5) Esquemas masivos (independientes del módulo Convenios).
--    Definen un mapa origen→destino que se aplica a muchos estudiantes.
create table if not exists transfer_schemes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  origin_institution text not null,
  dest_program_id    uuid,
  scale_id           uuid references grade_scales(id),
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);
create table if not exists transfer_scheme_items (
  id                 uuid primary key default gen_random_uuid(),
  scheme_id          uuid not null references transfer_schemes(id) on delete cascade,
  origin_course_name text not null,
  dest_course_id     uuid,
  dest_course_name   text
);

-- 6) Reflejar convalidadas en "Mis Notas" (academic_grades).
--    Las filas de convalidación se insertan con source='convalidacion' y no las toca el sync.
alter table academic_grades add column if not exists source text not null default 'systemactiva';
