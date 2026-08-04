-- ===========================================================================
-- PASO 1 · Planeamiento sobre año académico + una sola verdad por indicador
--
-- Dos cambios de fondo, ninguno destructivo:
--
--  1. Los tres documentos maestros pasan a colgar de academic_years (sep-ago),
--     que ya existía en el ERP. Hasta ahora cada plan guardaba un int suelto
--     ("year = 2025") que nadie podía cruzar con los semestres reales.
--
--  2. Los resultados salen de la tabla puente plan↔kpi y pasan a vivir una sola
--     vez por (indicador, año, periodo). Hoy, si el mismo indicador cuelga de
--     dos planes, puede tener dos resultados distintos y ambos parecen ciertos.
--     La META sí es de cada plan —dos planes pueden exigir distinto—, pero el
--     RESULTADO es un hecho: retención 2025-2026 es un solo número.
--
-- Se ejecuta por bloques. Ninguno borra datos.
-- ===========================================================================


-- ── BLOQUE 1 · Anclar los planes al año académico ──────────────────────────
-- No se borra la columna `year` todavía: queda de red hasta que el código
-- nuevo esté arriba y verificado.

alter table effectiveness_plans
  add column if not exists academic_year_id uuid references academic_years(id);

-- "year = 2025" significa el año académico que ARRANCA en 2025 → AY 2025-2026
update effectiveness_plans p
   set academic_year_id = y.id
  from academic_years y
 where p.academic_year_id is null
   and extract(year from y.start_date)::int = p.year;

alter table strategic_plan_cycles
  add column if not exists start_academic_year_id uuid references academic_years(id),
  add column if not exists end_academic_year_id   uuid references academic_years(id);

update strategic_plan_cycles c
   set start_academic_year_id =
         (select y.id from academic_years y where extract(year from y.start_date)::int = c.start_year),
       -- Un ciclo que "termina en 2028" termina con el AY 2027-2028.
       end_academic_year_id =
         (select y.id from academic_years y where extract(year from y.start_date)::int = c.end_year - 1)
 where c.start_academic_year_id is null;


-- ── BLOQUE 2 · El catálogo de indicadores se vuelve compartido ─────────────
-- effectiveness_kpis deja de ser "los KPI de Efectividad" y pasa a ser EL
-- catálogo: el Plan Estratégico, el de Efectividad y el IAP enlazan de aquí.
-- Por eso necesita saber de dónde sale cada indicador y contra qué se juzga.
--
--   source = de dónde nace el número
--     formula  → lo calcula el ERP solo
--     encuesta → sale de un instrumento (módulo de encuestas, por construir)
--     rubrica  → sale de evaluación directa (SLO, por construir)
--     manual   → alguien lo carga y firma
--
--   benchmark = el estándar institucional del IAP (retención >= 70, etc.),
--   distinto de la META de cada plan, que puede ser más exigente.

alter table effectiveness_kpis
  add column if not exists source             text,
  add column if not exists benchmark          numeric,
  add column if not exists benchmark_operator text not null default '>=',
  add column if not exists disaggregations    text[];

-- Lo que ya tiene fórmula automática, se marca como tal; el resto, manual.
update effectiveness_kpis
   set source = case when formula_type is not null then 'formula' else 'manual' end
 where source is null;

alter table effectiveness_kpis alter column source set default 'manual';
alter table effectiveness_kpis alter column source set not null;

alter table effectiveness_kpis drop constraint if exists effectiveness_kpis_source_check;
alter table effectiveness_kpis add constraint effectiveness_kpis_source_check
  check (source in ('manual', 'formula', 'encuesta', 'rubrica'));


-- ── BLOQUE 3 · Los resultados, en un solo lugar ────────────────────────────
-- Clave única (indicador, año, periodo): el mismo indicador no puede tener dos
-- resultados distintos para el mismo periodo. Eso es lo que hace que los tres
-- dashboards no se puedan contradecir.

create table if not exists indicator_results (
  id               bigserial primary key,
  indicator_id     uuid not null references effectiveness_kpis(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id)     on delete cascade,
  period           text not null default 'anual'
                     check (period in ('anual','fall','spring','summer','q1','q2','q3','q4')),
  value            numeric not null,
  source           text not null default 'manual'
                     check (source in ('manual','formula','encuesta','rubrica')),
  note             text,
  recorded_by      text,
  recorded_at      timestamptz not null default now(),
  unique (indicator_id, academic_year_id, period)
);

create index if not exists idx_indicator_results_year
  on indicator_results (academic_year_id, indicator_id);

alter table indicator_results enable row level security;
grant all on table indicator_results to service_role;
grant usage, select on sequence indicator_results_id_seq to service_role;

-- Rescatar los resultados que ya estaban cargados en el Plan de Efectividad.
insert into indicator_results (indicator_id, academic_year_id, period, value, source, note, recorded_at)
select pk.kpi_id, p.academic_year_id, 'anual', pk.resultado, 'manual',
       'Migrado del Plan de Efectividad', coalesce(pk.resultado_updated_at::timestamptz, now())
  from effectiveness_plan_kpis pk
  join effectiveness_plans p on p.id = pk.plan_id
 where pk.resultado is not null
   and p.academic_year_id is not null
on conflict (indicator_id, academic_year_id, period) do nothing;


-- ── BLOQUE 4 · Un solo ciclo estratégico activo ────────────────────────────
-- Había dos ciclos 'active'. El bueno es "Strategic Plan" (2023-2028): tiene
-- las 9 dimensiones vivas, los 9 objetivos, 24 acciones, 109 responsables y
-- los 34 KPIs. El otro se creó el 08-07 y quedó completamente vacío.
--
-- No se borra: se archiva. Un ciclo es la unidad de comparación histórica del
-- plan, y borrar filas de esa tabla es el tipo de limpieza que después nadie
-- puede explicar. Renombrarlo deja dicho por qué está ahí.

update strategic_plan_cycles
   set status = 'superseded',
       name   = name || ' (duplicado vacío — archivado)'
 where id = '673a8c9d-0d13-4ad6-84fd-9393eb18ef63'
   and not exists (select 1 from strategic_dimensions d where d.cycle_id = strategic_plan_cycles.id);


-- ── BLOQUE 5 · Verificación ────────────────────────────────────────────────
select 'planes de efectividad sin año académico' as control, count(*)::text as valor
  from effectiveness_plans where academic_year_id is null
union all
select 'ciclos estratégicos sin año académico de inicio', count(*)::text
  from strategic_plan_cycles where start_academic_year_id is null
union all
select 'ciclos estratégicos ACTIVOS (debe ser 1)', count(*)::text
  from strategic_plan_cycles where status = 'active'
union all
select 'dimensiones vigentes del ciclo activo', count(*)::text
  from strategic_dimensions d
  join strategic_plan_cycles c on c.id = d.cycle_id
 where c.status = 'active' and d.status = 'active'
union all
select 'objetivos institucionales vigentes (O1-O9)', count(*)::text
  from strategic_objectives where status = 'active'
union all
select 'indicadores en el catálogo', count(*)::text from effectiveness_kpis
union all
select '  · automáticos (fórmula)', count(*)::text from effectiveness_kpis where source = 'formula'
union all
select '  · manuales', count(*)::text from effectiveness_kpis where source = 'manual'
union all
select 'resultados migrados', count(*)::text from indicator_results
union all
select 'años académicos disponibles', count(*)::text from academic_years
union all
select 'AÑOS QUE TERMINAN ANTES QUE SU ÚLTIMO SEMESTRE', count(*)::text
  from academic_years y
 where exists (select 1 from academic_semesters s
                where s.academic_year_id = y.id and s.end_date > y.end_date);
