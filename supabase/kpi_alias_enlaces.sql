-- Doble nomenclatura y cruces navegables entre los tres planes (16/09/2026).
--
-- 1) ALIAS ESTRATÉGICO: en el documento maestro (hoja "Tablero Completo") los
--    KPIs compartidos tienen DOS códigos — el del plan estratégico (E1-K1) y
--    el del plan de efectividad (E1-O01). El ERP guarda un código por KPI
--    (catálogo); el código estratégico vive en el ENLACE al plan estratégico,
--    que es donde pertenece.
ALTER TABLE strategic_plan_kpis
  ADD COLUMN IF NOT EXISTS strategic_code text;

COMMENT ON COLUMN strategic_plan_kpis.strategic_code IS 'Código del KPI en la nomenclatura del plan estratégico (E1-K1...); el catálogo conserva el código de efectividad.';

-- 2) ENLACES REALES de las medidas del plan de evaluación a los KPIs: hoy las
--    medidas referencian códigos en TEXTO (effectiveness_kpi_codes /
--    strategic_kpi_codes), que un renombre rompería en silencio. El texto se
--    conserva como constancia del documento; la navegación usa esta tabla.
CREATE TABLE IF NOT EXISTS iap_measure_kpis (
  measure_id uuid NOT NULL REFERENCES iap_measures(id) ON DELETE CASCADE,
  kpi_id uuid NOT NULL REFERENCES effectiveness_kpis(id) ON DELETE CASCADE,
  PRIMARY KEY (measure_id, kpi_id)
);

ALTER TABLE iap_measure_kpis ENABLE ROW LEVEL SECURITY;
GRANT ALL ON iap_measure_kpis TO service_role;
