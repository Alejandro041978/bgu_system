-- ============================================================================
-- La nota apunta al SEMESTRE, en vez de llevar año y bloque por su cuenta.
--
-- El periodo de una nota responde a una pregunta que ningún otro periodo del
-- ERP contesta: cuándo cursó el estudiante esa asignatura. No sale de la
-- convocatoria —quien entró en 2024 cursa en 2024, 2025 y 2026— ni de la
-- oferta —un aula se dicta en varios semestres, la 155 en FALL 2024 y FALL
-- 2025—. Se usa para distinguir un recursado del intento original, para el
-- reporte por año académico y para los certificados de Registros.
--
-- El problema no era tenerlo: era guardarlo en dos campos sueltos que llenan
-- dos sistemas con vocabularios distintos.
--
--   term_block:  10.735 filas con un número de Activa ("1", "2", … "13")
--                 9.528 filas con un semestre de Moodle ("AY_25-26_FALL_2025")
--
-- Y contradiciéndose: de las 9.528 comparables, 6.747 tienen un term_year que
-- no concuerda con el año que nombra su propio bloque.
--
-- term_year y term_block se CONSERVAN: son el dato crudo tal como llegó, y
-- borrarlos impediría rehacer la traducción si la equivalencia cambia.
--
-- Ejecutar en Supabase (idempotente).
-- ============================================================================

alter table academic_grades         add column if not exists semester_id uuid;
alter table academic_grade_details  add column if not exists semester_id uuid;

-- La referencia va aparte: si la tabla ya la tuviera, un ADD CONSTRAINT suelto
-- aborta el script entero y no se entera nadie.
do $$
begin
  alter table academic_grades
    add constraint academic_grades_semester_fk
    foreign key (semester_id) references academic_semesters(id) on delete set null;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table academic_grade_details
    add constraint academic_grade_details_semester_fk
    foreign key (semester_id) references academic_semesters(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists idx_grades_semester on academic_grades (semester_id);

comment on column academic_grades.semester_id is
  'Semestre en que se cursó. Traducido de term_year/term_block, que se conservan como dato crudo.';

-- ── Volcado ────────────────────────────────────────────────────────────────
-- El trigger de actas cerradas devuelve OLD ante cualquier UPDATE que no
-- toque edited_at ni locked_at, así que sin desactivarlo 1.757 notas editadas
-- y 1.068 cerradas se quedarían sin semestre EN SILENCIO — que es exactamente
-- el modo de fallo que este ERP lleva semanas persiguiendo.
alter table academic_grades disable trigger protect_edited_grades_trg;

-- 1) SystemActiva: la equivalencia que dio Registros (2026-08-12).
--    Activa numeraba BLOQUES, no semestres —llega al 13 en 2025—, y su año no
--    es el año académico nuestro. Por eso la llave es el PAR año+bloque.
with equiv(anio, bloque, semestre) as (values
  (2023, '1',    'AY 23-24 FALL 2023'),
  (2024, '1',    'AY 23-24 SPRING 2024'),
  (2024, '2',    'AY 23-24 SUMMER 2024'),
  (2024, '2-A',  'AY 23-24 SUMMER 2024'),   -- las letras son secciones del
  (2024, '2-B',  'AY 23-24 SUMMER 2024'),   -- mismo bloque, no periodos
  (2024, '2-C',  'AY 23-24 SUMMER 2024'),   -- distintos
  (2024, '3',    'AY 24-25 FALL 2024'),
  (2025, '1',    'AY 24-25 SPRING 2025'),
  (2025, '2',    'AY 24-25 SPRING 2025'),
  (2025, '3',    'AY 24-25 SPRING 2025'),
  (2025, '4',    'AY 24-25 SPRING 2025'),
  (2025, '5',    'AY 24-25 SUMMER 2025'),
  (2025, '6',    'AY 24-25 SUMMER 2025'),
  (2025, '6-UA', 'AY 24-25 SUMMER 2025'),
  (2025, '7',    'AY 24-25 SUMMER 2025'),
  (2025, '8',    'AY 24-25 SUMMER 2025'),
  (2025, '9',    'AY 24-25 SUMMER 2025'),
  (2025, '10',   'AY 25-26 FALL 2025'),
  (2025, '11',   'AY 25-26 FALL 2025'),
  (2025, '12',   'AY 25-26 FALL 2025'),
  (2025, '13',   'AY 25-26 FALL 2025'),
  (2026, '1',    'AY 25-26 SPRING 2026'),
  (2026, '2',    'AY 25-26 SPRING 2026'),
  (2026, '3',    'AY 25-26 SPRING 2026'),
  (2026, '4',    'AY 25-26 SPRING 2026'),
  (2026, '5',    'AY 25-26 SUMMER 2026'),
  (2026, '6',    'AY 25-26 SUMMER 2026'),
  (2026, '7',    'AY 25-26 SUMMER 2026')
)
update academic_grades g
   set semester_id = s.id
  from equiv e
  join academic_semesters s on s.name = e.semestre
 where g.term_year = e.anio
   and g.term_block = e.bloque;

-- 2) Moodle: su bloque YA nombra el semestre, solo con guiones bajos.
update academic_grades g
   set semester_id = s.id
  from academic_semesters s
 where g.semester_id is null
   and g.term_block is not null
   and replace(g.term_block, '_', ' ') = s.name;

alter table academic_grades enable trigger protect_edited_grades_trg;

-- 3) El detalle hereda el semestre de su nota (misma inscripción).
update academic_grade_details d
   set semester_id = g.semester_id
  from academic_grades g
 where g.external_id = d.external_id
   and g.semester_id is not null;

-- ── Verificación ───────────────────────────────────────────────────────────
select
  (select count(*) from academic_grades where semester_id is not null)              as con_semestre,
  (select count(*) from academic_grades where semester_id is null
     and term_block is not null)                                                    as con_periodo_sin_traducir,
  (select count(*) from academic_grades where term_block is null)                   as sin_periodo,
  (select count(*) from academic_grades)                                            as notas,
  (select count(*) from academic_grade_details where semester_id is not null)       as detalles_con_semestre;
