-- ===========================================================================
-- Las 14 copias de Activa sobre asignaturas en curso
--
-- Son notas de Moodle bloqueadas por la política porque la misma asignatura
-- tiene nota de SystemActiva. Pero al mirarlas una a una, ninguna es un
-- recursado: todas tienen periodo 2026 en Activa y valores casi idénticos a
-- los del campus (59 vs 59.47, 38 vs 37.93, 67 vs 66.57). Activa guardó una
-- foto de la nota de Moodle antes de apagarse, el 20 de julio, y el campus
-- siguió avanzando.
--
-- No compiten: es la misma cursada registrada dos veces. Se borra la copia
-- congelada para que el campus vuelva a ser la fuente. La política queda
-- intacta — protege las notas históricas de asignaturas cerradas, no una
-- asignatura que el estudiante está llevando ahora.
--
-- Ejecutar DESPUÉS de politica_notas_trigger.sql.
-- ===========================================================================

-- ── 1. Universo, para verlo antes de tocar ─────────────────────────────────
create or replace view v_copias_activa as
select h.external_id      as activa_external_id,
       h.document_number,
       h.course_code,
       h.course_name,
       coalesce(h.retake_grade, h.final_grade) as nota_activa,
       h.term_year,
       coalesce(m.retake_grade, m.final_grade) as nota_moodle,
       m.moodle_course_id as aula,
       abs(coalesce(m.retake_grade, m.final_grade) - coalesce(h.retake_grade, h.final_grade)) as diferencia
  from academic_grades h
  join academic_grades m
    on m.course_id = h.course_id
   and m.document_number is not distinct from h.document_number
   and m.source = 'moodle'
 where h.source = 'systemactiva'
   and h.course_id is not null
   and coalesce(h.retake_grade, h.final_grade) is not null
   and coalesce((select attempt from academic_course_enrollments a
                  where a.id = m.course_enrollment_id), 1) < 2;

select * from v_copias_activa order by diferencia desc;


-- ── 2. Respaldo ────────────────────────────────────────────────────────────
create table if not exists copias_activa_bak_20260731 as
  select g.* from academic_grades g
   where g.external_id in (select activa_external_id from v_copias_activa);

create table if not exists copias_activa_detalle_bak_20260731 as
  select d.* from academic_grade_details d
   where d.external_id in (select activa_external_id from v_copias_activa);

grant all on table copias_activa_bak_20260731 to service_role;
grant all on table copias_activa_detalle_bak_20260731 to service_role;

select (select count(*) from copias_activa_bak_20260731) as notas_respaldadas;


-- ── 3. Borrado ─────────────────────────────────────────────────────────────
-- Se excluye el caso de HCM 600 (Activa 60 contra Moodle 37.96): es el único
-- donde Activa es MAYOR, y una diferencia así apunta a un aula con ítems sin
-- configurar, no a una copia. Ese se decide aparte, con el auditor del campus.

begin;

delete from academic_grade_details
 where external_id in (select activa_external_id from v_copias_activa where diferencia < 20);

delete from academic_grades
 where external_id in (select activa_external_id from v_copias_activa where diferencia < 20);

commit;


-- ── 4. Verificación ────────────────────────────────────────────────────────
-- Debe quedar solo el caso apartado.
select * from v_copias_activa;

-- Y ningún estudiante puede haberse quedado sin la asignatura: debe dar 0.
select count(*) as asignaturas_perdidas
  from copias_activa_bak_20260731 b
 where not exists (select 1 from academic_grades g
                    where g.document_number = b.document_number
                      and g.course_id = b.course_id);


-- ── Reversa ────────────────────────────────────────────────────────────────
-- insert into academic_grades select * from copias_activa_bak_20260731
--   on conflict (external_id) do nothing;
-- insert into academic_grade_details select * from copias_activa_detalle_bak_20260731
--   on conflict (external_id) do nothing;
