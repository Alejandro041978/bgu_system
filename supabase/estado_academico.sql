-- ===========================================================================
-- Estado académico de la nota: aprobado, reprobado, pendiente
--
-- La nota que trae Moodle es un ACUMULADO sobre el 100% del curso, no un
-- promedio de lo rendido. Un alumno que hizo un quiz de 3,33% con 100 puntos
-- tiene 3,33. Hoy el ERP guarda ese 3,33 igual que el 87 de quien terminó, y
-- lo trata como reprobado: para la situación académica, para el cálculo de
-- egresados y para comparar contra las notas de SystemActiva.
--
-- Medido sobre lo que hay importado: el 38,7% de las notas de Moodle
-- corresponden a cursos con menos del 71% rendido, y 425 muestran diez puntos
-- o más por debajo de lo que el alumno lleva ganado. No son reprobados: son
-- cursos a medio camino.
--
-- No se recalcula ninguna nota. Se guarda al lado cuánto está rendido, y el
-- estado que se deduce de eso.
-- ===========================================================================

alter table academic_grades
  -- Porcentaje del curso efectivamente calificado, sobre la ponderación real
  -- del aula. Se calcula del Acta Detallada; no hace falta pedirle nada a
  -- Moodle.
  add column if not exists rendido_pct       numeric,

  -- aprobado | reprobado | pendiente. Derivado: acumuló el mínimo → aprobado;
  -- rindió todo o el registro está cerrado y no llegó → reprobado; el resto,
  -- pendiente.
  add column if not exists estado_academico  text,

  -- Última vez que CAMBIÓ una nota del detalle. No es synced_at: ese se mueve
  -- cada vez que el cron mira el aula, aunque el alumno no haya entregado
  -- nada.
  --
  -- Hoy no lo usa nadie. Se empieza a capturar ahora porque los cierres por
  -- inactividad que vienen después —aprobados sin 100% a los 30 días,
  -- pendientes a los 12 meses— dependen de él, y ese historial es imposible de
  -- reconstruir hacia atrás.
  add column if not exists last_evaluated_at timestamptz;

create index if not exists idx_grades_estado   on academic_grades (estado_academico);
create index if not exists idx_grades_evaluado on academic_grades (last_evaluated_at);


-- ── Verificación ───────────────────────────────────────────────────────────
select
  count(*)                                              as notas,
  count(*) filter (where estado_academico is not null)  as con_estado,
  count(*) filter (where rendido_pct is not null)       as con_rendido
  from academic_grades;
