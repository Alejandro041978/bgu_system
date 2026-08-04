-- ===========================================================================
-- Encender la sincronización de los 587 vínculos
--
-- Hasta ahora sync_enabled no controlaba nada: el importador leía
-- semester_offerings y ni miraba esta bandera. Con el cambio de fuente el
-- interruptor por fin significa lo que dice, así que hay que encenderlo.
--
-- Vincular declara "esta aula corresponde a esta asignatura"; encender
-- autoriza "y quiero que sus notas entren al expediente". Son dos permisos
-- distintos y el segundo tiene que poder negarse — por eso queda la bandera y
-- no se elimina.
-- ===========================================================================

update moodle_course_links
   set sync_enabled = true,
       sync_enabled_by = 'carga inicial · migración de oferta formativa a plan de estudios',
       sync_enabled_at = now()
 where kind = 'asignatura'
   and replaced_at is null
   and sync_enabled = false;

-- ── Verificación ──────────────────────────────────────────────────────────
select 'vínculos de asignatura' as control, count(*)::text as valor
  from moodle_course_links where kind = 'asignatura' and replaced_at is null
union all select '  · sincronizando', count(*)::text
  from moodle_course_links where kind = 'asignatura' and replaced_at is null and sync_enabled
union all select 'aulas distintas que entrarán al cron', count(distinct aula_id)::text
  from moodle_course_links where kind = 'asignatura' and replaced_at is null and sync_enabled
union all select 'AULAS CON MÁS DE UNA ASIGNATURA (el import las rechaza)', count(*)::text from (
  select aula_id from moodle_course_links
   where kind = 'asignatura' and replaced_at is null and sync_enabled and course_id is not null
   group by aula_id having count(distinct course_id) > 1) t;
