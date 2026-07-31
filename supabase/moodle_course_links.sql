-- ===========================================================================
-- Identidad del aula: qué asignatura del plan enseña
--
-- Hasta ahora la conexión vivía en semester_offerings.moodle_course_id: el aula
-- colgaba de la OFERTA FORMATIVA. Eso está mal por dos razones. El aula
-- sobrevive a la oferta —se reutiliza entre cohortes año tras año, que es justo
-- lo que produjo las notas fantasma— y una misma asignatura tiene legítimamente
-- varias aulas (Inglés 2 tiene tres, una por programa).
--
-- La identidad cuelga del PLAN DE ESTUDIOS. La oferta se queda con lo que sí
-- sabe: qué cohorte se reúne dónde, en qué fechas, con qué grupo.
--
-- Consecuencia práctica: el cron deja de recorrer "las aulas vinculadas a una
-- oferta" (204) y pasa a recorrer "las aulas con identidad declarada". Las 474
-- aulas que hoy el ERP no mira —310 de ellas con alumnos dentro, 4.115
-- matrículas— dejan de ser invisibles.
--
-- kind = 'no_curricular' es para las aulas que no son asignaturas: la Encuesta
-- de Satisfacción (262 alumnos), el Examen Complementario (84), los módulos de
-- los cursos cortos. Se marcan una vez y dejan de aparecer como pendientes en
-- lugar de reaparecer en cada revisión.
-- ===========================================================================

create table if not exists moodle_course_links (
  aula_id             integer primary key,
  course_id           uuid references academic_courses(id),
  -- asignatura | no_curricular
  kind                text not null default 'asignatura',
  nota                text,
  linked_by           text,
  linked_at           timestamptz not null default now(),
  -- Cuándo se escribió el idnumber en Moodle. Mientras sea null, la identidad
  -- vive sólo en el ERP; el espejo en el campus queda pendiente de que
  -- habiliten core_course_update_courses en el servicio web.
  idnumber_synced_at  timestamptz,

  constraint moodle_course_links_coherente check (
    (kind = 'asignatura'   and course_id is not null) or
    (kind = 'no_curricular' and course_id is null)
  )
);

create index if not exists idx_mcl_course on moodle_course_links (course_id);
create index if not exists idx_mcl_kind   on moodle_course_links (kind);

alter table moodle_course_links enable row level security;
grant all on table moodle_course_links to service_role;


-- ── Verificación ───────────────────────────────────────────────────────────
select
  (select count(*) from moodle_course_links)                              as vinculos,
  (select count(*) from moodle_aula_audit)                                as aulas_del_campus,
  (select count(distinct moodle_course_id) from semester_offerings
    where moodle_course_id is not null)                                   as vinculadas_por_oferta;
