-- Auditor del Campus: foto ESTRUCTURAL de cada aula Moodle (independiente de
-- estudiantes y calificaciones) contra la política institucional: las
-- ponderaciones de los recursos evaluados ACTIVOS suman 100% y el total del
-- curso está en escala sobre 100. Los recursos ocultos no cuentan.
-- Se refresca con el botón "Auditar ahora" del reporte.
drop table if exists moodle_aula_audit;
create table moodle_aula_audit (
  aula_id integer primary key,
  shortname text,
  fullname text,
  visible boolean,
  linked_course text,          -- asignatura vinculada en el ERP (o null)
  recursos integer,            -- módulos totales del aula
  recursos_activos integer,    -- módulos visibles (no ocultos)
  items_evaluacion integer,    -- recursos con entrada en el libro de calificaciones
  items_activos integer,       -- de esos, cuántos están activos (visibles)
  items_con_peso integer,      -- activos que ponderan (> 0)
  suma_pesos numeric,          -- suma de ponderaciones de primer nivel ACTIVAS (en %)
  escala_total numeric,        -- grademax del total del curso
  cumple_pesos boolean,
  cumple_escala boolean,
  metodo text,                 -- 'alumno' (aula con matriculados) | 'auditor' (cuenta de servicio)
  error text,
  audited_at timestamptz not null default now()
);

alter table moodle_aula_audit enable row level security;
