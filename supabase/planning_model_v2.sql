-- ===========================================================================
-- Modelo de Planeamiento v2 — lo que aportó el reporte del Plan de Efectividad
--
-- Cuatro cambios aprobados. La frecuencia mensual NO se implementa: el usuario
-- confirmó que todo es anual y que las frecuencias semestral/mensual de la
-- hoja son un error del reporte.
-- ===========================================================================


-- ── BLOQUE 1 · Dos responsables, no uno ────────────────────────────────────
-- La hoja separa quién RESPONDE (la división) de quién CARGA el dato (la
-- persona). Son conversaciones distintas: cuando falta el dato se le escribe
-- al cargador; cuando el resultado es malo responde la división.
--
-- responsible_id ya guardaba a la persona en los 34 enlaces, así que conserva
-- ese significado y solo se agrega la unidad.
alter table effectiveness_plan_kpis
  add column if not exists responsible_unit text;


-- ── BLOQUE 2 · Tipo de medida en el catálogo ───────────────────────────────
-- Va en el catálogo y no en cada plan para que el IAP y Efectividad clasifiquen
-- igual. "Mixta" no existía en el IAP y sí en la realidad: cuatro KPIs combinan
-- evidencia directa e indirecta.
alter table effectiveness_kpis
  add column if not exists measure_type text;

alter table effectiveness_kpis drop constraint if exists effectiveness_kpis_measure_type_check;
alter table effectiveness_kpis add constraint effectiveness_kpis_measure_type_check
  check (measure_type is null or measure_type in
    ('cuantitativa_directa','cuantitativa_indirecta','mixta','cualitativa'));


-- ── BLOQUE 3 · Una sola escala de estados para los tres planes ─────────────
-- El IAP juzga con cinco estados y Efectividad con tres. El mismo 91% de
-- retención terminaba juzgado con dos reglas distintas según qué documento lo
-- mirara. La escala deja de ser "del IAP" y pasa a ser institucional.
alter table iap_status_catalog rename to assessment_status_catalog;

-- Y el juicio, en el enlace de Efectividad. La META sigue siendo de cada plan;
-- lo que se comparte es el criterio con el que se lee el resultado.
alter table effectiveness_plan_kpis
  add column if not exists estado   text,
  add column if not exists decision text;

alter table effectiveness_plan_kpis drop constraint if exists effectiveness_plan_kpis_estado_check;
alter table effectiveness_plan_kpis add constraint effectiveness_plan_kpis_estado_check
  check (estado is null or estado in
    ('cumplido','parcial','no_cumplido','sin_datos','no_aplicable'));


-- ── BLOQUE 4 · La evidencia es un documento, no un texto ───────────────────
-- Regla del usuario: no se aceptan textos de evidencia. Un nombre de archivo
-- escrito a mano no es evidencia — nadie puede abrirlo, verificarlo ni saber
-- si existe. Ante un acreditador, una referencia que no se puede abrir vale lo
-- mismo que ninguna.
--
-- Las 33 filas ya cargadas son nombres sin archivo. No se borran: quedan
-- marcadas como pendientes para que se vea QUÉ documento hay que adjuntar.
create table if not exists effectiveness_evidence (
  id          uuid primary key default gen_random_uuid(),
  plan_kpi_id uuid not null references effectiveness_plan_kpis(id) on delete cascade,
  label       text not null,
  url         text,
  note        text,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_eff_evidence on effectiveness_evidence (plan_kpi_id);

alter table effectiveness_evidence enable row level security;
grant all on table effectiveness_evidence to service_role;

-- Marca de "citada pero sin adjuntar", en ambos planes.
alter table iap_measure_evidence   add column if not exists pending boolean not null default false;
alter table effectiveness_evidence add column if not exists pending boolean not null default false;

update iap_measure_evidence set pending = true where url is null and pending = false;


-- ── BLOQUE 5 · Verificación ────────────────────────────────────────────────
select 'escala de estados (renombrada)' as control, count(*)::text as valor from assessment_status_catalog
union all select 'enlaces de efectividad', count(*)::text from effectiveness_plan_kpis
union all select '  · con unidad responsable', count(*)::text from effectiveness_plan_kpis where responsible_unit is not null
union all select '  · con estado', count(*)::text from effectiveness_plan_kpis where estado is not null
union all select 'KPIs con tipo de medida', count(*)::text from effectiveness_kpis where measure_type is not null
union all select 'evidencia IAP sin documento adjunto', count(*)::text from iap_measure_evidence where pending;
