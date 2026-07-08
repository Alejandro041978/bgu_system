-- ============================================================================
-- Convocatorias (= CommercialTerms de SystemActiva, a nivel de CATEGORÍA).
-- Una convocatoria = (categoría, Year, Block). Amarrada a un academic_semester.
-- La admisión del estudiante apunta a la convocatoria; el semestre se DERIVA.
-- Ejecutar en Supabase.
-- ============================================================================
create table if not exists convocatorias (
  id                       uuid primary key default gen_random_uuid(),
  name                     text,
  product_category_id      uuid references academic_programs_category(id),
  academic_semester_id     uuid references academic_semesters(id),   -- derivado por fecha
  term_year                integer,
  term_block               text,
  registration_start_date  date,
  deadline_date            date,     -- cierre de matrícula (RegistrationEndDate)
  first_day                date,     -- inicio (StartDate)
  end_date                 date,
  created_at               timestamptz not null default now(),
  unique (product_category_id, term_year, term_block)
);

-- Vínculo admisión → convocatoria (el semestre se deriva vía la convocatoria)
alter table academic_student_enrollments
  add column if not exists convocatoria_id uuid references convocatorias(id);
