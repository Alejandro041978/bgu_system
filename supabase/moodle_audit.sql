-- Auditor del Campus: foto del estado de cada aula Moodle contra la política
-- institucional (ponderaciones de primer nivel suman 100%, total sobre 100).
-- Se refresca con el botón "Auditar ahora" del reporte.
create table if not exists moodle_aula_audit (
  aula_id integer primary key,
  shortname text,
  fullname text,
  visible boolean,
  linked_course text,          -- asignatura vinculada en el ERP (o null)
  recursos integer,            -- módulos totales del aula (contenido)
  items_evaluacion integer,    -- ítems de calificación (mod)
  items_con_peso integer,      -- de esos, cuántos ponderan (> 0)
  suma_pesos numeric,          -- suma de ponderaciones de primer nivel (en %)
  escala_total numeric,        -- grademax del total del curso
  cumple_pesos boolean,
  cumple_escala boolean,
  error text,
  audited_at timestamptz not null default now()
);

alter table moodle_aula_audit enable row level security;
