-- ===========================================================================
-- IAP · El reporte anual
--
-- El punto que cambia el modelo: la fuente de un indicador NO es una propiedad
-- permanente. Este año el 20% sale del ERP y el resto se carga a mano; el año
-- que viene serán más. Y como el IAP es anual, cada ciclo puede además traer
-- medidas distintas.
--
-- Por eso todo esto va sobre iap_measures y no sobre el catálogo: una medida
-- pertenece a un plan, y un plan es un año. La medida YA es anual. Cambiar el
-- origen de D-01 de "externo" a "fórmula" el año que viene no es migrar nada:
-- es el plan del año que viene naciendo con otro binding.
--
-- Lo que NO se duplica es el resultado. Cuando la medida tiene indicador, el
-- número sigue viviendo en indicator_results, una sola vez por año. Lo que
-- vive aquí es el JUICIO del IAP sobre ese número —su meta, su estado, su
-- decisión—, que es distinto del juicio del Plan de Efectividad sobre el mismo
-- número. El hecho se comparte; la evaluación no.
-- ===========================================================================


-- ── BLOQUE 1 · Campos de diseño de la medida ───────────────────────────────
alter table iap_measures
  add column if not exists purpose                  text,
  add column if not exists minimum_data             text,
  add column if not exists expected_evidence        text,
  add column if not exists cross_type               text,
  add column if not exists no_cross_note            text,
  add column if not exists expected_use             text,
  add column if not exists effectiveness_kpi_codes  text[],
  add column if not exists strategic_kpi_codes      text[];


-- ── BLOQUE 2 · Ejecución anual de la medida ────────────────────────────────
-- source_binding = de dónde se va a obtener ESTE año.
--   erp_formula → lo calcula el ERP
--   externo     → lo carga una persona con su evidencia
--   encuesta / rubrica → subsistemas por construir
--   pendiente   → todavía no se decidió
alter table iap_measures
  add column if not exists target_text        text,
  add column if not exists target_value       numeric,
  add column if not exists target_operator    text default '>=',
  add column if not exists owner_employee_id  uuid references hr_employees(id) on delete set null,
  add column if not exists owner_label        text,
  add column if not exists source_binding     text not null default 'pendiente',
  add column if not exists result_value       numeric,
  add column if not exists result_text        text,
  add column if not exists result_status      text,
  add column if not exists decision           text,
  add column if not exists result_note        text,
  add column if not exists result_recorded_at timestamptz,
  add column if not exists result_recorded_by text;

alter table iap_measures drop constraint if exists iap_measures_binding_check;
alter table iap_measures add constraint iap_measures_binding_check
  check (source_binding in ('erp_formula','externo','encuesta','rubrica','manual','pendiente'));

alter table iap_measures drop constraint if exists iap_measures_status_check;
alter table iap_measures add constraint iap_measures_status_check
  check (result_status is null or result_status in
    ('cumplido','parcial','no_cumplido','sin_datos','no_aplicable'));


-- ── BLOQUE 3 · La escala de estados, editable por la OIQE ──────────────────
-- Va en tabla y no en el código porque los criterios son del documento, no del
-- software: quien redacta el IAP debe poder ajustarlos sin un despliegue.
--
-- La distinción que sostiene todo el instrumento es sin_datos ≠ 0. Un cero
-- afirma que se midió y dio cero; "sin datos" dice que no se pudo medir. Ante
-- un acreditador son cosas opuestas: la primera es un incumplimiento, la
-- segunda es un vacío de evidencia.
create table if not exists iap_status_catalog (
  code      text primary key,
  label     text not null,
  criterio  text,
  tratamiento text,
  seq       int not null default 0
);

insert into iap_status_catalog (code, label, criterio, tratamiento, seq) values
 ('cumplido','Cumplido','Meta alcanzada o superada, considerando la dirección del KPI.','Mantener, elevar meta o cerrar mejora.',1),
 ('parcial','Parcialmente cumplido','Avance real pero por debajo de la meta.','Analizar causa y fortalecer acciones.',2),
 ('no_cumplido','No cumplido','Se midió y el resultado no alcanza la meta.','Acción de mejora obligatoria cuando proceda.',3),
 ('sin_datos','Sin datos','La fuente no produjo información válida. NO registrar cero.','Plan de obtención y responsable.',4),
 ('no_aplicable','No aplicable / cohorte no madura','El indicador no puede medirse legítimamente en el periodo.','Justificar y programar la primera medición válida.',5)
on conflict (code) do update
  set label = excluded.label, criterio = excluded.criterio,
      tratamiento = excluded.tratamiento, seq = excluded.seq;


-- ── BLOQUE 4 · Evidencia ───────────────────────────────────────────────────
-- Una medida puede sustentarse en varios documentos, así que no cabe en una
-- columna. Sin evidencia trazable, un resultado cargado a mano es una
-- afirmación sin respaldo — que es exactamente lo que una acreditación
-- rechaza.
create table if not exists iap_measure_evidence (
  id          uuid primary key default gen_random_uuid(),
  measure_id  uuid not null references iap_measures(id) on delete cascade,
  label       text not null,
  url         text,
  note        text,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_iap_evidence_measure on iap_measure_evidence (measure_id);

alter table iap_status_catalog   enable row level security;
alter table iap_measure_evidence enable row level security;
grant all on table iap_status_catalog   to service_role;
grant all on table iap_measure_evidence to service_role;


-- ── BLOQUE 5 · Verificación ────────────────────────────────────────────────
select 'estados en la escala (debe ser 5)' as control, count(*)::text as valor from iap_status_catalog
union all select 'medidas', count(*)::text from iap_measures
union all select '  · con binding decidido', count(*)::text from iap_measures where source_binding <> 'pendiente'
union all select '  · con meta cargada', count(*)::text from iap_measures where target_text is not null
union all select '  · con resultado', count(*)::text from iap_measures where result_status is not null
union all select 'documentos de evidencia', count(*)::text from iap_measure_evidence;
