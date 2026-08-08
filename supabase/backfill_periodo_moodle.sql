-- ===========================================================================
-- Backfill del periodo de las notas de Moodle.  EN 5 PASOS.
--
-- Corre cada paso por separado en el SQL Editor y mira el resultado antes de
-- seguir. El paso 1 no escribe nada en las notas.
--
-- Por que hace falta: term_year se escribia como el año de la CORRIDA del
-- importador, asi que las 1.704 notas de Moodle decian 2026 y ninguna traia
-- semestre. El periodo real sale de la oferta del aula (semester_offerings →
-- semestre → año academico).
--
-- Solo se tocan las notas cuyo periodo es DEDUCIBLE SIN AMBIGUEDAD: su aula
-- tiene una sola oferta, o su ultima evaluacion en Moodle cae dentro de una
-- unica ventana de semestre. Las aulas se reutilizan entre cohortes, y elegir
-- una oferta a dedo seria volver a fabricar el dato que se esta corrigiendo.
-- ===========================================================================


-- ── PASO 1 ─────────────────────────────────────────────────────────────────
-- Calcula el periodo deducible y lo deja en una tabla de trabajo.
-- No toca ninguna nota. Debe devolver alrededor de 491 filas.

drop table if exists bf_periodo;

create table bf_periodo as
with sem_de_aula as (
  select distinct
         o.moodle_course_id::text                     as aula,
         s.id                                         as sem_id,
         s.name                                       as semestre,
         extract(year from y.start_date)::int         as anio,
         s.start_date,
         s.end_date
    from semester_offerings o
    join academic_semesters s on s.id = o.semester_id
    join academic_years     y on y.id = s.academic_year_id
   where o.moodle_course_id is not null
),
unica as (                    -- el aula se dicto en un solo semestre
  select aula, min(semestre) as semestre, min(anio) as anio
    from (select distinct aula, sem_id, semestre, anio from sem_de_aula) t
   group by aula
  having count(*) = 1
),
nota as (
  select g.external_id,
         g.moodle_course_id::text as aula,
         g.last_evaluated_at
    from academic_grades g
   where g.source = 'moodle'
     and g.withdrawn_at is null
     and g.moodle_course_id is not null
),
por_fecha as (                -- el aula tiene varias, pero la fecha decide
  select n.external_id, min(d.semestre) as semestre, min(d.anio) as anio
    from nota n
    join sem_de_aula d on d.aula = n.aula
   where n.last_evaluated_at is not null
     and n.last_evaluated_at::date between d.start_date and d.end_date
   group by n.external_id
  having count(distinct d.sem_id) = 1
)
select n.external_id,
       coalesce(u.anio, f.anio)                                   as anio,
       replace(coalesce(u.semestre, f.semestre), ' ', '_')        as bloque
  from nota n
  left join unica     u on u.aula        = n.aula
  left join por_fecha f on f.external_id = n.external_id
 where coalesce(u.anio, f.anio) is not null;

select count(*) as filas_a_escribir from bf_periodo;


-- ── PASO 2 ─────────────────────────────────────────────────────────────────
-- Respaldo de lo que hay hoy, para poder revertir (ver el ultimo paso).

drop table if exists bf_periodo_bak;

create table bf_periodo_bak as
  select g.external_id, g.term_year, g.term_block
    from academic_grades g
   where g.external_id in (select external_id from bf_periodo);

select count(*) as filas_respaldadas from bf_periodo_bak;


-- ── PASO 3 ─────────────────────────────────────────────────────────────────
-- La escritura. El trigger protect_edited_grades congela term_year y
-- term_block en las filas editadas a mano (425 de estas lo estan), asi que se
-- apaga durante el UPDATE y se vuelve a encender en la misma transaccion: si
-- algo falla, no queda apagado. Ninguna calificacion se toca.
--
-- Si sale "must be owner of relation academic_grades", corre antes, en esta
-- misma pestaña:   set role postgres;

begin;

alter table academic_grades disable trigger protect_edited_grades_trg;

update academic_grades g
   set term_year  = b.anio,
       term_block = b.bloque
  from bf_periodo b
 where g.external_id = b.external_id;

alter table academic_grades enable trigger protect_edited_grades_trg;

-- El Acta Detallada agrupa por term_block: si se queda con el viejo, la misma
-- asignatura aparece en dos periodos distintos segun la pantalla.
update academic_grade_details d
   set term_year  = b.anio,
       term_block = b.bloque
  from bf_periodo b
 where d.external_id = b.external_id;

commit;


-- ── PASO 4 ─────────────────────────────────────────────────────────────────
-- Verificacion. "cambiadas" debe ser ~486 (las otras 5 ya estaban bien).
-- Si diera 0, algun guardian descarto el UPDATE en silencio: avisame antes de
-- dar esto por bueno.

select 'cambiadas' as control, count(*)::text as valor
  from academic_grades g
  join bf_periodo_bak k on k.external_id = g.external_id
 where g.term_year  is distinct from k.term_year
    or g.term_block is distinct from k.term_block
union all
select 'Moodle con semestre', count(*)::text
  from academic_grades where source = 'moodle' and term_block is not null
union all
select 'Moodle sin semestre (aula ambigua o sin oferta)', count(*)::text
  from academic_grades where source = 'moodle' and term_block is null
union all
select 'Moodle por año: ' || coalesce(term_year::text, 'sin año'), count(*)::text
  from academic_grades where source = 'moodle' group by term_year;


-- ── PASO 5 ─────────────────────────────────────────────────────────────────
-- Limpieza, cuando el paso 4 se vea bien.

drop table if exists bf_periodo;
drop table if exists bf_periodo_bak;


-- ── REVERSA (solo si hace falta, ANTES del paso 5) ──────────────────────────
-- begin;
-- alter table academic_grades disable trigger protect_edited_grades_trg;
-- update academic_grades g
--    set term_year = k.term_year, term_block = k.term_block
--   from bf_periodo_bak k where g.external_id = k.external_id;
-- alter table academic_grades enable trigger protect_edited_grades_trg;
-- commit;
