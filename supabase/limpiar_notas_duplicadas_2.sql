-- ===========================================================================
-- Segunda parte: la misma asignatura con DOS filas de Moodle
--
-- Mismo origen que la primera limpieza. Cuando el import leía el historial y
-- la consulta fallaba, no encontraba ni siquiera la fila que él mismo había
-- creado días antes, así que la volvía a dar de alta con otro external_id.
--
-- Por eso en 73 de los 74 casos las dos filas están en LA MISMA aula y la
-- vieja quedó con edited_at: no es una corrección de nadie, es el blindaje
-- que el import pone a las filas que rellena. Verificado contra grade_audit:
-- ninguna de estas 148 filas tiene una edición de origen 'editor'.
--
-- Se conserva la fila más reciente, que es la que trae la nota actual del
-- campus (p. ej. Supply Chain Management: la vieja decía 45.62, la nueva 97).
-- ===========================================================================


-- ── 1. UNIVERSO ────────────────────────────────────────────────────────────
-- Solo entran los grupos de una sola aula: si el alumno tiene la asignatura en
-- dos aulas distintas, eso no lo resuelve una limpieza sino un criterio
-- académico, y sale aparte en el paso 5.

create or replace view v_moodle_repetidas as
with grupos as (
  select document_number, course_code,
         count(*) as filas,
         count(distinct moodle_course_id) filter (where moodle_course_id is not null) as aulas
    from academic_grades
   where source = 'moodle'
   group by document_number, course_code
  having count(*) > 1
),
ordenadas as (
  select g.external_id, g.document_number, g.course_code, g.course_name,
         g.final_grade, g.moodle_course_id, g.synced_at, g.locked_at,
         row_number() over (
           partition by g.document_number, g.course_code
           order by g.synced_at desc nulls last, g.external_id desc) as puesto
    from academic_grades g
    join grupos gr on gr.document_number = g.document_number
                  and gr.course_code is not distinct from g.course_code
   where g.source = 'moodle' and gr.aulas <= 1
)
select * from ordenadas where puesto > 1;   -- todas menos la más reciente

select count(*) as filas_a_borrar,
       count(distinct document_number) as estudiantes,
       count(*) filter (where locked_at is not null) as bloqueadas
  from v_moodle_repetidas;


-- ── 2. MUESTRA ─────────────────────────────────────────────────────────────
-- Cada línea es la fila que se va; para comparar, al lado la que se queda.
select v.document_number, v.course_code, v.course_name, v.moodle_course_id as aula,
       v.final_grade as nota_que_se_va, v.synced_at as sync_que_se_va,
       q.final_grade as nota_que_queda, q.synced_at as sync_que_queda
  from v_moodle_repetidas v
  join academic_grades q
    on q.document_number = v.document_number
   and q.course_code is not distinct from v.course_code
   and q.source = 'moodle'
   and q.external_id not in (select external_id from v_moodle_repetidas)
 order by v.document_number
 limit 40;


-- ── 3. RESPALDO ────────────────────────────────────────────────────────────
create table if not exists moodle_repetidas_bak_20260731 as
  select g.* from academic_grades g
   where g.external_id in (select external_id from v_moodle_repetidas);

create table if not exists moodle_repetidas_detalle_bak_20260731 as
  select d.* from academic_grade_details d
   where d.external_id in (select external_id from v_moodle_repetidas);

grant all on table moodle_repetidas_bak_20260731 to service_role;
grant all on table moodle_repetidas_detalle_bak_20260731 to service_role;

select (select count(*) from moodle_repetidas_bak_20260731)         as notas_respaldadas,
       (select count(*) from moodle_repetidas_detalle_bak_20260731) as actas_respaldadas;


-- ── 4. BORRADO ─────────────────────────────────────────────────────────────
begin;

delete from academic_grade_details
 where external_id in (select external_id from v_moodle_repetidas where locked_at is null);

delete from academic_grades
 where external_id in (select external_id from v_moodle_repetidas where locked_at is null);

commit;


-- ── 5. VERIFICACIÓN ────────────────────────────────────────────────────────
select count(*) as repetidas_restantes from v_moodle_repetidas;

-- Ningún alumno puede haberse quedado SIN la asignatura: debe dar 0.
select count(*) as asignaturas_perdidas
  from moodle_repetidas_bak_20260731 b
 where not exists (select 1 from academic_grades g
                    where g.document_number = b.document_number
                      and g.course_code is not distinct from b.course_code);

-- El único caso de dos aulas distintas, que NO se tocó: decisión académica
-- sobre cuál de las dos matrículas vale.
select document_number, course_code, course_name,
       array_agg(moodle_course_id order by synced_at) as aulas,
       array_agg(final_grade      order by synced_at) as notas,
       array_agg(external_id      order by synced_at) as ids
  from academic_grades
 where source = 'moodle'
 group by document_number, course_code, course_name
having count(*) > 1;


-- ── REVERSA ────────────────────────────────────────────────────────────────
-- insert into academic_grades select * from moodle_repetidas_bak_20260731
--   on conflict (external_id) do nothing;
-- insert into academic_grade_details select * from moodle_repetidas_detalle_bak_20260731
--   on conflict (external_id) do nothing;
