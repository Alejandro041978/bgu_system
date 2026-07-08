-- ============================================================================
-- MIGRACIÓN: convocatorias con UNA sola categoría por registro.
-- Reemplaza el muchos-a-muchos (convocatoria_categories) por una columna directa
-- product_category_id. Las convocatorias compartidas (Master + 3 DCE) se separan
-- en una por categoría. Re-vincula matrículas (por categoría + fecha) y cuotas.
-- Ejecutar en Supabase (idempotente por drop+recreate).
-- ============================================================================

begin;

-- 0) Soltar vínculos (se re-arman abajo)
update academic_student_enrollments set convocatoria_id = null;
update account_charges set convocatoria_id = null;
-- billing_plans puede no existir todavía; solo si existe
do $$ begin
  if to_regclass('public.billing_plans') is not null then
    update billing_plans set convocatoria_id = null;   -- si tenías planes, reasigna la convocatoria luego
  end if;
end $$;

-- 1) Esquema nuevo: convocatoria con categoría única
drop table if exists convocatoria_categories;
drop table if exists convocatorias cascade;

create table convocatorias (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  product_category_id      uuid references academic_programs_category(id),
  academic_semester_id     uuid references academic_semesters(id),
  registration_start_date  date,
  deadline_date            date,
  first_day                date,
  end_date                 date,
  created_at               timestamptz not null default now(),
  unique (product_category_id, academic_semester_id, first_day)
);

-- 2) Cargar convocatorias (una por categoría) desde el CSV, expandiendo mdce -> Master + 3 DCE
insert into convocatorias (name, product_category_id, academic_semester_id, deadline_date, first_day)
with stg(grp, sem, deadline, first_day) as (
  values
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
),
expanded as (
  select cat.id as product_category_id, cat.name as cat_name, s.sem, s.deadline, s.first_day
  from stg s
  join academic_programs_category cat on (
       (s.grp = 'bachelor' and cat.name ilike 'Bachelor%')
    or (s.grp = 'doctor'   and cat.name ilike 'Doctor%')
    or (s.grp = 'mdce'     and (cat.name ilike 'Master%' or cat.name ilike 'Division of Continuing Education%'))
  )
)
select
  e.cat_name || ' · ' || e.sem || ' · L' ||
    row_number() over (partition by e.product_category_id, e.sem order by e.first_day),
  e.product_category_id,
  sem.id,
  e.deadline,
  e.first_day
from expanded e
left join academic_semesters sem on sem.name = e.sem;

-- 3) Re-crear FKs de las tablas que apuntan a convocatorias
alter table academic_student_enrollments drop constraint if exists academic_student_enrollments_convocatoria_id_fkey;
alter table academic_student_enrollments
  add constraint academic_student_enrollments_convocatoria_id_fkey foreign key (convocatoria_id) references convocatorias(id);

alter table account_charges drop constraint if exists account_charges_convocatoria_id_fkey;
alter table account_charges
  add constraint account_charges_convocatoria_id_fkey foreign key (convocatoria_id) references convocatorias(id);

do $$ begin
  if to_regclass('public.billing_plans') is not null then
    alter table billing_plans drop constraint if exists billing_plans_convocatoria_id_fkey;
    alter table billing_plans
      add constraint billing_plans_convocatoria_id_fkey foreign key (convocatoria_id) references convocatorias(id);
  end if;
end $$;

-- 4) Re-vincular matrículas por (categoría del programa + fecha de admisión más cercana)
with best as (
  select distinct on (e.id) e.id as enr_id, c.id as conv_id
  from academic_student_enrollments e
  join academic_programs p on p.id = e.program_id
  join convocatorias c     on c.product_category_id = p.category_id
  where e.enrollment_date is not null
  order by e.id, abs(c.first_day - e.enrollment_date::date)
)
update academic_student_enrollments e set convocatoria_id = best.conv_id from best where e.id = best.enr_id;

-- 5) Las cuotas siguen a su matrícula
update account_charges ac set convocatoria_id = e.convocatoria_id
from academic_student_enrollments e where e.id = ac.enrollment_id;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- a) Total (esperado 231): select count(*) from convocatorias;
-- b) Por categoría (Master 44, cada DCE 44, Bachelor 33, Doctoral 22):
--    select cat.name, count(*) from convocatorias c
--      join academic_programs_category cat on cat.id = c.product_category_id
--      group by cat.name order by cat.name;
-- c) Matrículas vinculadas (esperado 1995):
--    select count(convocatoria_id) from academic_student_enrollments;
-- ============================================================================
