-- ============================================================================
-- RECONSTRUCCIÓN DE CONVOCATORIAS (modelo limpio, sin dependencia de SystemActiva)
--
-- Modelo:
--   convocatorias            = un llamado de admisión (semestre + fechas), nombre fijo
--   convocatoria_categories  = muchos-a-muchos: una convocatoria sirve a varias categorías
--                              (Master + DCE1/2/3 comparten juego; Bachelor y Doctoral aparte)
--   academic_student_enrollments.convocatoria_id -> convocatorias(id)  (semestre se DERIVA)
--
-- Sin term_year / term_block. Ejecutar en Supabase (idempotente por drop+recreate).
-- Datos inline en CTE (sin tabla temporal, compatible con el editor de Supabase).
-- ============================================================================

begin;

-- 0) Soltar el vínculo viejo para poder recrear la tabla
update academic_student_enrollments set convocatoria_id = null;

-- 1) Esquema limpio
drop table if exists convocatoria_categories;
drop table if exists convocatorias cascade;

create table convocatorias (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  academic_semester_id     uuid references academic_semesters(id),
  registration_start_date  date,
  deadline_date            date,   -- cierre de matrícula
  first_day                date,   -- inicio del llamado
  end_date                 date,
  created_at               timestamptz not null default now(),
  grp                      text    -- TEMPORAL: arma el junction y luego se elimina
);

create table convocatoria_categories (
  convocatoria_id      uuid references convocatorias(id) on delete cascade,
  product_category_id  uuid references academic_programs_category(id),
  primary key (convocatoria_id, product_category_id)
);

-- 2) Insertar convocatorias desde CTE inline (nombre fijo: GRUPO · SEMESTRE · L{n})
insert into convocatorias (name, academic_semester_id, deadline_date, first_day, grp)
with stg(grp, sem, deadline, first_day) as (
  values
  -- ---- MASTER + DCE ----
  ('mdce','AY 22-23 SUMMER 2023', to_date('24/04/2023','DD/MM/YYYY'), to_date('01/05/2023','DD/MM/YYYY')),
  ('mdce','AY 23-24 FALL 2023',   to_date('28/08/2023','DD/MM/YYYY'), to_date('04/09/2023','DD/MM/YYYY')),
  ('mdce','AY 23-24 SPRING 2024', to_date('25/12/2023','DD/MM/YYYY'), to_date('01/01/2024','DD/MM/YYYY')),
  ('mdce','AY 23-24 SUMMER 2024', to_date('29/04/2024','DD/MM/YYYY'), to_date('06/05/2024','DD/MM/YYYY')),
  ('mdce','AY 24-25 FALL 2024',   to_date('26/08/2024','DD/MM/YYYY'), to_date('02/09/2024','DD/MM/YYYY')),
  ('mdce','AY 24-25 SPRING 2025', to_date('23/12/2024','DD/MM/YYYY'), to_date('30/12/2024','DD/MM/YYYY')),
  ('mdce','AY 24-25 SUMMER 2025', to_date('21/04/2025','DD/MM/YYYY'), to_date('28/04/2025','DD/MM/YYYY')),
  ('mdce','AY 25-26 FALL 2025',   to_date('25/08/2025','DD/MM/YYYY'), to_date('01/09/2025','DD/MM/YYYY')),
  ('mdce','AY 25-26 SPRING 2026', to_date('22/12/2025','DD/MM/YYYY'), to_date('29/12/2025','DD/MM/YYYY')),
  ('mdce','AY 25-26 SUMMER 2026', to_date('20/04/2026','DD/MM/YYYY'), to_date('27/04/2026','DD/MM/YYYY')),
  ('mdce','AY 26 - 27 FALL 2026', to_date('31/08/2026','DD/MM/YYYY'), to_date('07/09/2026','DD/MM/YYYY')),
  ('mdce','AY 22-23 SUMMER 2023', to_date('22/05/2023','DD/MM/YYYY'), to_date('29/05/2023','DD/MM/YYYY')),
  ('mdce','AY 23-24 FALL 2023',   to_date('25/09/2023','DD/MM/YYYY'), to_date('02/10/2023','DD/MM/YYYY')),
  ('mdce','AY 23-24 SPRING 2024', to_date('22/01/2024','DD/MM/YYYY'), to_date('29/01/2024','DD/MM/YYYY')),
  ('mdce','AY 23-24 SUMMER 2024', to_date('27/05/2024','DD/MM/YYYY'), to_date('03/06/2024','DD/MM/YYYY')),
  ('mdce','AY 24-25 FALL 2024',   to_date('23/09/2024','DD/MM/YYYY'), to_date('30/09/2024','DD/MM/YYYY')),
  ('mdce','AY 24-25 SPRING 2025', to_date('20/01/2025','DD/MM/YYYY'), to_date('27/01/2025','DD/MM/YYYY')),
  ('mdce','AY 24-25 SUMMER 2025', to_date('19/05/2025','DD/MM/YYYY'), to_date('26/05/2025','DD/MM/YYYY')),
  ('mdce','AY 25-26 FALL 2025',   to_date('22/09/2025','DD/MM/YYYY'), to_date('29/09/2025','DD/MM/YYYY')),
  ('mdce','AY 25-26 SPRING 2026', to_date('19/01/2026','DD/MM/YYYY'), to_date('26/01/2026','DD/MM/YYYY')),
  ('mdce','AY 25-26 SUMMER 2026', to_date('18/05/2026','DD/MM/YYYY'), to_date('25/05/2026','DD/MM/YYYY')),
  ('mdce','AY 26 - 27 FALL 2026', to_date('28/09/2026','DD/MM/YYYY'), to_date('05/10/2026','DD/MM/YYYY')),
  ('mdce','AY 22-23 SUMMER 2023', to_date('19/06/2023','DD/MM/YYYY'), to_date('26/06/2023','DD/MM/YYYY')),
  ('mdce','AY 23-24 FALL 2023',   to_date('23/10/2023','DD/MM/YYYY'), to_date('30/10/2023','DD/MM/YYYY')),
  ('mdce','AY 23-24 SPRING 2024', to_date('19/02/2024','DD/MM/YYYY'), to_date('26/02/2024','DD/MM/YYYY')),
  ('mdce','AY 23-24 SUMMER 2024', to_date('24/06/2024','DD/MM/YYYY'), to_date('01/07/2024','DD/MM/YYYY')),
  ('mdce','AY 24-25 FALL 2024',   to_date('21/10/2024','DD/MM/YYYY'), to_date('28/10/2024','DD/MM/YYYY')),
  ('mdce','AY 24-25 SPRING 2025', to_date('17/02/2025','DD/MM/YYYY'), to_date('24/02/2025','DD/MM/YYYY')),
  ('mdce','AY 24-25 SUMMER 2025', to_date('16/06/2025','DD/MM/YYYY'), to_date('23/06/2025','DD/MM/YYYY')),
  ('mdce','AY 25-26 FALL 2025',   to_date('20/10/2025','DD/MM/YYYY'), to_date('27/10/2025','DD/MM/YYYY')),
  ('mdce','AY 25-26 SPRING 2026', to_date('16/02/2026','DD/MM/YYYY'), to_date('23/02/2026','DD/MM/YYYY')),
  ('mdce','AY 25-26 SUMMER 2026', to_date('15/06/2026','DD/MM/YYYY'), to_date('22/06/2026','DD/MM/YYYY')),
  ('mdce','AY 26 - 27 FALL 2026', to_date('26/10/2026','DD/MM/YYYY'), to_date('02/11/2026','DD/MM/YYYY')),
  ('mdce','AY 22-23 SUMMER 2023', to_date('17/07/2023','DD/MM/YYYY'), to_date('24/07/2023','DD/MM/YYYY')),
  ('mdce','AY 23-24 FALL 2023',   to_date('20/11/2023','DD/MM/YYYY'), to_date('27/11/2023','DD/MM/YYYY')),
  ('mdce','AY 23-24 SPRING 2024', to_date('18/03/2024','DD/MM/YYYY'), to_date('25/03/2024','DD/MM/YYYY')),
  ('mdce','AY 23-24 SUMMER 2024', to_date('22/07/2024','DD/MM/YYYY'), to_date('29/07/2024','DD/MM/YYYY')),
  ('mdce','AY 24-25 FALL 2024',   to_date('18/11/2024','DD/MM/YYYY'), to_date('25/11/2024','DD/MM/YYYY')),
  ('mdce','AY 24-25 SPRING 2025', to_date('17/03/2025','DD/MM/YYYY'), to_date('24/03/2025','DD/MM/YYYY')),
  ('mdce','AY 24-25 SUMMER 2025', to_date('14/07/2025','DD/MM/YYYY'), to_date('21/07/2025','DD/MM/YYYY')),
  ('mdce','AY 25-26 FALL 2025',   to_date('17/11/2025','DD/MM/YYYY'), to_date('24/11/2025','DD/MM/YYYY')),
  ('mdce','AY 25-26 SPRING 2026', to_date('16/03/2026','DD/MM/YYYY'), to_date('23/03/2026','DD/MM/YYYY')),
  ('mdce','AY 25-26 SUMMER 2026', to_date('13/07/2026','DD/MM/YYYY'), to_date('20/07/2026','DD/MM/YYYY')),
  ('mdce','AY 26 - 27 FALL 2026', to_date('23/11/2026','DD/MM/YYYY'), to_date('30/11/2026','DD/MM/YYYY')),
  -- ---- BACHELOR ----
  ('bachelor','AY 22-23 SUMMER 2023', to_date('24/04/2023','DD/MM/YYYY'), to_date('01/05/2023','DD/MM/YYYY')),
  ('bachelor','AY 23-24 FALL 2023',   to_date('28/08/2023','DD/MM/YYYY'), to_date('04/09/2023','DD/MM/YYYY')),
  ('bachelor','AY 23-24 SPRING 2024', to_date('25/12/2023','DD/MM/YYYY'), to_date('01/01/2024','DD/MM/YYYY')),
  ('bachelor','AY 23-24 SUMMER 2024', to_date('29/04/2024','DD/MM/YYYY'), to_date('06/05/2024','DD/MM/YYYY')),
  ('bachelor','AY 24-25 FALL 2024',   to_date('26/08/2024','DD/MM/YYYY'), to_date('02/09/2024','DD/MM/YYYY')),
  ('bachelor','AY 24-25 SPRING 2025', to_date('23/12/2024','DD/MM/YYYY'), to_date('30/12/2024','DD/MM/YYYY')),
  ('bachelor','AY 24-25 SUMMER 2025', to_date('21/04/2025','DD/MM/YYYY'), to_date('28/04/2025','DD/MM/YYYY')),
  ('bachelor','AY 25-26 FALL 2025',   to_date('25/08/2025','DD/MM/YYYY'), to_date('01/09/2025','DD/MM/YYYY')),
  ('bachelor','AY 25-26 SPRING 2026', to_date('22/12/2025','DD/MM/YYYY'), to_date('29/12/2025','DD/MM/YYYY')),
  ('bachelor','AY 25-26 SUMMER 2026', to_date('20/04/2026','DD/MM/YYYY'), to_date('27/04/2026','DD/MM/YYYY')),
  ('bachelor','AY 26 - 27 FALL 2026', to_date('31/08/2026','DD/MM/YYYY'), to_date('07/09/2026','DD/MM/YYYY')),
  ('bachelor','AY 22-23 SUMMER 2023', to_date('29/05/2023','DD/MM/YYYY'), to_date('05/06/2023','DD/MM/YYYY')),
  ('bachelor','AY 23-24 FALL 2023',   to_date('02/10/2023','DD/MM/YYYY'), to_date('09/10/2023','DD/MM/YYYY')),
  ('bachelor','AY 23-24 SPRING 2024', to_date('29/01/2024','DD/MM/YYYY'), to_date('05/02/2024','DD/MM/YYYY')),
  ('bachelor','AY 23-24 SUMMER 2024', to_date('03/06/2024','DD/MM/YYYY'), to_date('10/06/2024','DD/MM/YYYY')),
  ('bachelor','AY 24-25 FALL 2024',   to_date('30/09/2024','DD/MM/YYYY'), to_date('07/10/2024','DD/MM/YYYY')),
  ('bachelor','AY 24-25 SPRING 2025', to_date('27/01/2025','DD/MM/YYYY'), to_date('03/02/2025','DD/MM/YYYY')),
  ('bachelor','AY 24-25 SUMMER 2025', to_date('26/05/2025','DD/MM/YYYY'), to_date('02/06/2025','DD/MM/YYYY')),
  ('bachelor','AY 25-26 FALL 2025',   to_date('29/09/2025','DD/MM/YYYY'), to_date('06/10/2025','DD/MM/YYYY')),
  ('bachelor','AY 25-26 SPRING 2026', to_date('26/01/2026','DD/MM/YYYY'), to_date('02/02/2026','DD/MM/YYYY')),
  ('bachelor','AY 25-26 SUMMER 2026', to_date('25/05/2026','DD/MM/YYYY'), to_date('01/06/2026','DD/MM/YYYY')),
  ('bachelor','AY 26 - 27 FALL 2026', to_date('05/10/2026','DD/MM/YYYY'), to_date('12/10/2026','DD/MM/YYYY')),
  ('bachelor','AY 22-23 SUMMER 2023', to_date('03/07/2023','DD/MM/YYYY'), to_date('10/07/2023','DD/MM/YYYY')),
  ('bachelor','AY 23-24 FALL 2023',   to_date('06/11/2023','DD/MM/YYYY'), to_date('13/11/2023','DD/MM/YYYY')),
  ('bachelor','AY 23-24 SPRING 2024', to_date('04/03/2024','DD/MM/YYYY'), to_date('11/03/2024','DD/MM/YYYY')),
  ('bachelor','AY 23-24 SUMMER 2024', to_date('08/07/2024','DD/MM/YYYY'), to_date('15/07/2024','DD/MM/YYYY')),
  ('bachelor','AY 24-25 FALL 2024',   to_date('04/11/2024','DD/MM/YYYY'), to_date('11/11/2024','DD/MM/YYYY')),
  ('bachelor','AY 24-25 SPRING 2025', to_date('03/03/2025','DD/MM/YYYY'), to_date('10/03/2025','DD/MM/YYYY')),
  ('bachelor','AY 24-25 SUMMER 2025', to_date('30/06/2025','DD/MM/YYYY'), to_date('07/07/2025','DD/MM/YYYY')),
  ('bachelor','AY 25-26 FALL 2025',   to_date('03/11/2025','DD/MM/YYYY'), to_date('10/11/2025','DD/MM/YYYY')),
  ('bachelor','AY 25-26 SPRING 2026', to_date('02/03/2026','DD/MM/YYYY'), to_date('09/03/2026','DD/MM/YYYY')),
  ('bachelor','AY 25-26 SUMMER 2026', to_date('29/06/2026','DD/MM/YYYY'), to_date('06/07/2026','DD/MM/YYYY')),
  ('bachelor','AY 26 - 27 FALL 2026', to_date('09/11/2026','DD/MM/YYYY'), to_date('16/11/2026','DD/MM/YYYY')),
  -- ---- DOCTORAL ----
  ('doctor','AY 22-23 SUMMER 2023', to_date('24/04/2023','DD/MM/YYYY'), to_date('01/05/2023','DD/MM/YYYY')),
  ('doctor','AY 23-24 FALL 2023',   to_date('28/08/2023','DD/MM/YYYY'), to_date('04/09/2023','DD/MM/YYYY')),
  ('doctor','AY 23-24 SPRING 2024', to_date('25/12/2023','DD/MM/YYYY'), to_date('01/01/2024','DD/MM/YYYY')),
  ('doctor','AY 23-24 SUMMER 2024', to_date('29/04/2024','DD/MM/YYYY'), to_date('06/05/2024','DD/MM/YYYY')),
  ('doctor','AY 24-25 FALL 2024',   to_date('26/08/2024','DD/MM/YYYY'), to_date('02/09/2024','DD/MM/YYYY')),
  ('doctor','AY 24-25 SPRING 2025', to_date('23/12/2024','DD/MM/YYYY'), to_date('30/12/2024','DD/MM/YYYY')),
  ('doctor','AY 24-25 SUMMER 2025', to_date('21/04/2025','DD/MM/YYYY'), to_date('28/04/2025','DD/MM/YYYY')),
  ('doctor','AY 25-26 FALL 2025',   to_date('25/08/2025','DD/MM/YYYY'), to_date('01/09/2025','DD/MM/YYYY')),
  ('doctor','AY 25-26 SPRING 2026', to_date('22/12/2025','DD/MM/YYYY'), to_date('29/12/2025','DD/MM/YYYY')),
  ('doctor','AY 25-26 SUMMER 2026', to_date('20/04/2026','DD/MM/YYYY'), to_date('27/04/2026','DD/MM/YYYY')),
  ('doctor','AY 26 - 27 FALL 2026', to_date('31/08/2026','DD/MM/YYYY'), to_date('07/09/2026','DD/MM/YYYY')),
  ('doctor','AY 22-23 SUMMER 2023', to_date('19/06/2023','DD/MM/YYYY'), to_date('26/06/2023','DD/MM/YYYY')),
  ('doctor','AY 23-24 FALL 2023',   to_date('23/10/2023','DD/MM/YYYY'), to_date('30/10/2023','DD/MM/YYYY')),
  ('doctor','AY 23-24 SPRING 2024', to_date('19/02/2024','DD/MM/YYYY'), to_date('26/02/2024','DD/MM/YYYY')),
  ('doctor','AY 23-24 SUMMER 2024', to_date('24/06/2024','DD/MM/YYYY'), to_date('01/07/2024','DD/MM/YYYY')),
  ('doctor','AY 24-25 FALL 2024',   to_date('21/10/2024','DD/MM/YYYY'), to_date('28/10/2024','DD/MM/YYYY')),
  ('doctor','AY 24-25 SPRING 2025', to_date('17/02/2025','DD/MM/YYYY'), to_date('24/02/2025','DD/MM/YYYY')),
  ('doctor','AY 24-25 SUMMER 2025', to_date('16/06/2025','DD/MM/YYYY'), to_date('23/06/2025','DD/MM/YYYY')),
  ('doctor','AY 25-26 FALL 2025',   to_date('20/10/2025','DD/MM/YYYY'), to_date('27/10/2025','DD/MM/YYYY')),
  ('doctor','AY 25-26 SPRING 2026', to_date('16/02/2026','DD/MM/YYYY'), to_date('23/02/2026','DD/MM/YYYY')),
  ('doctor','AY 25-26 SUMMER 2026', to_date('15/06/2026','DD/MM/YYYY'), to_date('22/06/2026','DD/MM/YYYY')),
  ('doctor','AY 26 - 27 FALL 2026', to_date('26/10/2026','DD/MM/YYYY'), to_date('02/11/2026','DD/MM/YYYY'))
)
select
  (case s.grp when 'mdce' then 'MSTR/DCE' when 'bachelor' then 'BACHELOR' when 'doctor' then 'DOCTORAL' end)
    || ' · ' || s.sem
    || ' · L' || row_number() over (partition by s.grp, s.sem order by s.first_day),
  sem.id,
  s.deadline,
  s.first_day,
  s.grp
from stg s
left join academic_semesters sem on sem.name = s.sem;

-- 3) Junction muchos-a-muchos: expandir grupo -> categorías
insert into convocatoria_categories (convocatoria_id, product_category_id)
select c.id, cat.id
from convocatorias c
join academic_programs_category cat on (
     (c.grp = 'bachelor' and cat.name ilike 'Bachelor%')
  or (c.grp = 'doctor'   and cat.name ilike 'Doctor%')
  or (c.grp = 'mdce'     and (cat.name ilike 'Master%' or cat.name ilike 'Division of Continuing Education%'))
);

-- 4) Quitar la columna temporal
alter table convocatorias drop column grp;

-- 5) Re-crear el FK de matrículas -> convocatorias
alter table academic_student_enrollments
  drop constraint if exists academic_student_enrollments_convocatoria_id_fkey;
alter table academic_student_enrollments
  add constraint academic_student_enrollments_convocatoria_id_fkey
  foreign key (convocatoria_id) references convocatorias(id);

commit;

-- ============================================================================
-- VERIFICACIÓN (correr después; todo debe cuadrar)
-- ============================================================================
-- a) Convocatorias con semestre NO encontrado (debe ser 0)
--    select name, first_day from convocatorias where academic_semester_id is null order by first_day;
-- b) Total de convocatorias (esperado 99)
--    select count(*) as convocatorias from convocatorias;
-- c) Junction por categoría (esperado: Master 44, cada DCE 44, Bachelor 33, Doctoral 22 = 231)
--    select cat.name, count(*) as convocatorias
--    from convocatoria_categories jc
--    join academic_programs_category cat on cat.id = jc.product_category_id
--    group by cat.name order by cat.name;
