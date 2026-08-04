-- ===========================================================================
-- Modelo de Planeamiento v3 — lo que aportó el reporte del Plan Estratégico
--
-- El cambio de fondo: la meta deja de ser un punto y pasa a ser una
-- trayectoria. El Plan Estratégico compromete 11 → 13 → 15 programas
-- autorizados a lo largo del ciclo, y esa curva ES el plan. Con una sola meta
-- por año no se puede decir si un resultado va adelantado o atrasado respecto
-- de lo comprometido — solo si cumplió el año.
-- ===========================================================================


-- ── BLOQUE 1 · Unidad y plan dueño del indicador ───────────────────────────
-- value_type distingue porcentaje/entero/decimal, que no alcanza: 12 horas,
-- USD 3.3M, 11 programas y 4.61 sobre 5 son todos "decimal" y significan cosas
-- distintas. Y ahora que el catálogo lo comparten tres planes, hay que saber
-- cuál define cada indicador.
alter table effectiveness_kpis
  add column if not exists unit       text,
  add column if not exists owner_plan text;

update effectiveness_kpis set owner_plan = 'efectividad' where owner_plan is null;

alter table effectiveness_kpis drop constraint if exists effectiveness_kpis_owner_plan_check;
alter table effectiveness_kpis add constraint effectiveness_kpis_owner_plan_check
  check (owner_plan in ('efectividad', 'estrategico', 'iap'));


-- ── BLOQUE 2 · La curva de metas ───────────────────────────────────────────
-- Una meta por indicador y por año académico, definidas por adelantado para
-- todo el ciclo. No reemplaza a effectiveness_plan_kpis.meta: esa es la meta
-- que un plan ANUAL se fija: esta es el compromiso plurianual del ciclo.
create table if not exists indicator_targets (
  id               bigserial primary key,
  indicator_id     uuid not null references effectiveness_kpis(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id)     on delete cascade,
  value            numeric not null,
  operator         text not null default '>=' check (operator in ('>=', '<=', '=')),
  note             text,
  unique (indicator_id, academic_year_id)
);
create index if not exists idx_targets_year on indicator_targets (academic_year_id);


-- ── BLOQUE 3 · Composición de indicadores ──────────────────────────────────
-- E1-K3 se compone de E1-I02, E1-I03 y E1-S02. Un KPI estratégico agrega
-- varios de Efectividad, y sin esta relación no hay forma de explicar de dónde
-- sale su número ni de detectar que dos planes miden lo mismo con distinto
-- nombre.
create table if not exists indicator_composition (
  parent_id uuid not null references effectiveness_kpis(id) on delete cascade,
  child_id  uuid not null references effectiveness_kpis(id) on delete cascade,
  primary key (parent_id, child_id),
  check (parent_id <> child_id)
);
create index if not exists idx_composition_child on indicator_composition (child_id);


-- ── BLOQUE 4 · Los KPI del Plan Estratégico, colgados de su objetivo ───────
-- Espeja lo que effectiveness_plan_kpis hace para el Plan de Efectividad. Sin
-- esto los 28 indicadores nuevos quedarían en el catálogo sin pertenecer a
-- ningún plan, y el tablero estratégico no podría mostrarlos.
create table if not exists strategic_plan_kpis (
  id             uuid primary key default gen_random_uuid(),
  cycle_id       uuid not null references strategic_plan_cycles(id) on delete cascade,
  kpi_id         uuid not null references effectiveness_kpis(id)    on delete cascade,
  objective_id   uuid references strategic_objectives(id) on delete set null,
  responsible_id uuid references hr_employees(id)         on delete set null,
  owner_label    text,
  created_at     timestamptz not null default now(),
  unique (cycle_id, kpi_id)
);
create index if not exists idx_spk_objective on strategic_plan_kpis (objective_id);


-- ── BLOQUE 5 · El juicio y la evidencia, junto al resultado ────────────────
-- El estado es la lectura de un resultado, y un resultado es de un indicador y
-- un año. Ponerlo aquí evita una tabla por plan.
--
-- (El Plan de Efectividad conserva su estado en effectiveness_plan_kpis: su
--  plan es anual, así que allí no hay ambigüedad. Consolidar los dos en uno
--  solo vale la pena cuando exista un segundo año cargado.)
alter table indicator_results
  add column if not exists status text;

alter table indicator_results drop constraint if exists indicator_results_status_check;
alter table indicator_results add constraint indicator_results_status_check
  check (status is null or status in
    ('cumplido','parcial','no_cumplido','sin_datos','no_aplicable'));

-- Evidencia por indicador y año — la forma general de las dos tablas que ya
-- existen por plan. Las nuevas cargas entran aquí.
create table if not exists indicator_evidence (
  id               uuid primary key default gen_random_uuid(),
  indicator_id     uuid not null references effectiveness_kpis(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id)     on delete cascade,
  label            text not null,
  url              text,
  pending          boolean not null default false,
  uploaded_by      text,
  uploaded_at      timestamptz not null default now()
);
create index if not exists idx_ind_evidence on indicator_evidence (indicator_id, academic_year_id);

alter table indicator_targets     enable row level security;
alter table indicator_composition enable row level security;
alter table strategic_plan_kpis   enable row level security;
alter table indicator_evidence    enable row level security;

grant all on table indicator_targets     to service_role;
grant all on table indicator_composition to service_role;
grant all on table strategic_plan_kpis   to service_role;
grant all on table indicator_evidence    to service_role;
grant usage, select on sequence indicator_targets_id_seq to service_role;


-- ── BLOQUE 6 · Verificación ────────────────────────────────────────────────
select 'indicadores en el catálogo' as control, count(*)::text as valor from effectiveness_kpis
union all select '  · del Plan de Efectividad', count(*)::text from effectiveness_kpis where owner_plan='efectividad'
union all select '  · del Plan Estratégico', count(*)::text from effectiveness_kpis where owner_plan='estrategico'
union all select 'metas de la curva', count(*)::text from indicator_targets
union all select 'relaciones de composición', count(*)::text from indicator_composition
union all select 'KPI enganchados al ciclo estratégico', count(*)::text from strategic_plan_kpis
union all select 'resultados (todos los años)', count(*)::text from indicator_results
union all select 'evidencia por indicador/año', count(*)::text from indicator_evidence;
