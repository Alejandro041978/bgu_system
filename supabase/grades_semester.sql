-- ============================================================================
-- La nota apunta al SEMESTRE, en vez de llevar año y bloque por su cuenta.
--
-- El periodo de una nota responde a una pregunta que ningún otro periodo del
-- ERP contesta: cuándo cursó el estudiante esa asignatura. No sale de la
-- convocatoria —quien entró en 2024 cursa en 2024, 2025 y 2026— ni de la
-- oferta —un aula se dicta en varios semestres, la 155 en FALL 2024 y FALL
-- 2025—. Y se usa para distinguir un recursado del intento original, para el
-- reporte por año académico y para los certificados de Registros.
--
-- El problema no era tenerlo: era guardarlo en dos campos sueltos que llenan
-- dos sistemas con vocabularios distintos.
--
--   term_block:  10.735 filas con un número de Activa ("1", "2", … "13")
--                 9.528 filas con un semestre de Moodle ("AY_25-26_FALL_2025")
--
-- Y contradiciéndose: de las 9.528 comparables, 6.747 tienen un term_year que
-- no concuerda con el año que nombra su propio bloque. De ahí salían
-- encabezados como "2025 · AY_25-26_SUMMER_2026", el año de un sistema junto
-- al nombre de otro.
--
-- term_year y term_block se CONSERVAN: son el dato crudo tal como llegó, y
-- borrarlos impediría rehacer la traducción si la equivalencia cambia.
--
-- Ejecutar en Supabase (idempotente).
-- ============================================================================

alter table academic_grades
  add column if not exists semester_id uuid references academic_semesters(id) on delete set null;

create index if not exists idx_grades_semester on academic_grades (semester_id);

comment on column academic_grades.semester_id is
  'Semestre en que se cursó. Traducido de term_year/term_block, que se conservan como dato crudo.';

-- Mismo tratamiento para el detalle, que arrastra su propia copia del periodo.
alter table academic_grade_details
  add column if not exists semester_id uuid references academic_semesters(id) on delete set null;

select
  (select count(*) from academic_grades where semester_id is not null) as notas_con_semestre,
  (select count(*) from academic_grades)                              as notas;
