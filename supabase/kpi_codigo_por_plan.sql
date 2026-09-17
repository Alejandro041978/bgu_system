-- El código de un KPI es del KPI DENTRO DE UN PLAN, no del KPI (17/09/2026).
-- Corrección del usuario: un indicador es una denominación; cada plan le pone
-- su código con su propia nomenclatura:
--   · Efectividad  E1-S01  (E# = estrategia; I/O/S = institucional/operativo/estratégico)
--   · Estratégico  E1-K4   (ya vive en strategic_plan_kpis.strategic_code)
--   · Evaluación   D-05    (ya vive en iap_measures.code; D/I = directo/indirecto)
-- Faltaba el lugar del código de EFECTIVIDAD: hoy estaba en el campo code del
-- catálogo (por eso se veía "al inicio para todos"). Se agrega al enlace del
-- plan y se puebla aquí mismo con los códigos actuales.
ALTER TABLE effectiveness_plan_kpis
  ADD COLUMN IF NOT EXISTS plan_code text;

UPDATE effectiveness_plan_kpis e
   SET plan_code = upper(trim(k.code))
  FROM effectiveness_kpis k
 WHERE k.id = e.kpi_id
   AND e.plan_code IS NULL
   AND upper(trim(k.code)) ~ '^E[0-9]+-[IOS][0-9]+$';

COMMENT ON COLUMN effectiveness_plan_kpis.plan_code IS 'Código del KPI en la nomenclatura del plan de efectividad (E1-S01: E# estrategia + I/O/S nivel + correlativo). El campo code del catálogo queda como identificador interno.';
