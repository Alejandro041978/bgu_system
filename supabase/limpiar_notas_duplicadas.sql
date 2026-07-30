-- ===========================================================================
-- Limpieza de las notas que el import duplicó
--
-- Causa (ya corregida en el código, commit 44d42d7): al leer el historial de
-- notas de un aula, un fallo de la consulta devolvía una lista vacía en vez de
-- romper. El import lo interpretaba como "estos alumnos no tienen notas" y
-- daba de alta desde cero asignaturas que ya estaban aprobadas.
--
-- Aquí se borra SOLO la fila sobrante de Moodle, nunca la nota histórica.
--
-- Ejecutar por pasos y pegar el resultado de cada uno antes de seguir.
-- ===========================================================================


-- ── 1. UNIVERSO ────────────────────────────────────────────────────────────
-- Cuántas filas de Moodle pisan una asignatura ya aprobada en el histórico.
-- "Aprobada" se evalúa igual que en el código: retake_grade ?? final_grade,
-- contra passing_score (70 si no lo trae).

create or replace view v_notas_duplicadas as
select m.external_id          as moodle_external_id,
       m.document_number,
       m.course_code,
       m.course_name,
       m.final_grade          as nota_moodle,
       m.moodle_course_id     as aula,
       m.edited_at            as moodle_editada,
       m.locked_at            as moodle_bloqueada,
       h.external_id          as historico_external_id,
       coalesce(h.retake_grade, h.final_grade) as nota_historica,
       h.passing_score,
       h.source               as origen_historico
  from academic_grades m
  join academic_grades h
    on h.document_number = m.document_number
   and h.external_id <> m.external_id
   and h.course_code is not distinct from m.course_code
   and h.source not in ('moodle', 'csv', 'convalidacion', 'validacion')
   and coalesce(h.retake_grade, h.final_grade) is not null
   and coalesce(h.retake_grade, h.final_grade) >= coalesce(h.passing_score, 70)
 where m.source = 'moodle';

select count(*) as filas_a_borrar,
       count(distinct document_number) as estudiantes,
       count(*) filter (where moodle_editada  is not null) as editadas_a_mano,
       count(*) filter (where moodle_bloqueada is not null) as bloqueadas
  from v_notas_duplicadas;


-- ── 2. MUESTRA ─────────────────────────────────────────────────────────────
-- Revisar a ojo antes de borrar nada. La columna nota_historica debe ser
-- siempre >= passing_score y la nota_moodle es la que sobra.

select document_number, course_code, course_name, aula,
       nota_moodle, nota_historica, passing_score, origen_historico
  from v_notas_duplicadas
 order by document_number, course_code
 limit 40;


-- ── 3. RESPALDO ────────────────────────────────────────────────────────────
-- La fila entera, no solo el id: con esto se puede deshacer todo.

create table if not exists notas_duplicadas_bak_20260731 as
  select g.* from academic_grades g
   where g.external_id in (select moodle_external_id from v_notas_duplicadas);

create table if not exists notas_duplicadas_detalle_bak_20260731 as
  select d.* from academic_grade_details d
   where d.external_id in (select moodle_external_id from v_notas_duplicadas);

select (select count(*) from notas_duplicadas_bak_20260731)         as notas_respaldadas,
       (select count(*) from notas_duplicadas_detalle_bak_20260731) as actas_respaldadas;


-- ── 4. BORRADO ─────────────────────────────────────────────────────────────
-- Las bloqueadas (locked_at) NO se tocan: alguien las selló a propósito y esa
-- decisión manda sobre esta limpieza. Salen en el paso 6 para revisarlas.

begin;

delete from academic_grade_details
 where external_id in (select moodle_external_id from v_notas_duplicadas
                        where moodle_bloqueada is null);

delete from academic_grades
 where external_id in (select moodle_external_id from v_notas_duplicadas
                        where moodle_bloqueada is null);

commit;


-- ── 5. VERIFICACIÓN ────────────────────────────────────────────────────────
-- Debe quedar en 0 (salvo las bloqueadas, si las hubiera).

select count(*) as duplicadas_restantes from v_notas_duplicadas;

-- Y ninguna asignatura aprobada puede haberse perdido: esto debe dar 0 filas.
select count(*) as historicos_perdidos
  from notas_duplicadas_bak_20260731 b
 where not exists (select 1 from academic_grades g
                    where g.document_number = b.document_number
                      and g.course_code = b.course_code);


-- ── 6. PENDIENTES DE CRITERIO ──────────────────────────────────────────────
-- 6a. Las bloqueadas que no se borraron, si las hay.
select * from v_notas_duplicadas where moodle_bloqueada is not null;

-- 6b. Otro caso, del mismo origen pero que no se puede resolver a ciegas: dos
--     filas de Moodle para la misma asignatura (el alumno figura en dos aulas,
--     o una fila se rellenó sobre el external_id de Activa y la otra nació
--     nueva). Aquí hay que elegir cuál se queda, y eso es criterio académico.
select document_number, course_code, course_name,
       count(*) as filas,
       array_agg(final_grade order by synced_at)      as notas,
       array_agg(moodle_course_id order by synced_at) as aulas,
       array_agg(external_id order by synced_at)      as ids
  from academic_grades
 where source = 'moodle'
 group by document_number, course_code, course_name
having count(*) > 1
 order by count(*) desc, document_number
 limit 60;


-- ── REVERSA ────────────────────────────────────────────────────────────────
-- insert into academic_grades select * from notas_duplicadas_bak_20260731
--   on conflict (external_id) do nothing;
-- insert into academic_grade_details select * from notas_duplicadas_detalle_bak_20260731
--   on conflict (external_id) do nothing;
