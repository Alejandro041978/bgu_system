-- ---------------------------------------------------------------------------
-- Vigencia por años académicos de los KPI del Plan Estratégico (10/09/2026).
--
-- Regla del usuario: sin años, el KPI rige toda la vigencia del ciclo del
-- plan; con año de inicio, rige desde ese año académico EN ADELANTE; con año
-- final, rige HASTA ese año académico INCLUSIVE (24-25 → 26-27 = rige en
-- 24-25, 25-26 y 26-27). Permite el relevo natural: el KPI viejo cierra en un
-- año y su sucesor nace con inicio en el siguiente, sin borrar historia.
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

ALTER TABLE strategic_plan_kpis
  ADD COLUMN IF NOT EXISTS valid_from_year_id uuid REFERENCES academic_years(id),
  ADD COLUMN IF NOT EXISTS valid_to_year_id uuid REFERENCES academic_years(id);

COMMENT ON COLUMN strategic_plan_kpis.valid_from_year_id IS
  'Primer año académico en que rige el KPI (null = desde el inicio del ciclo).';
COMMENT ON COLUMN strategic_plan_kpis.valid_to_year_id IS
  'Último año académico en que rige el KPI, INCLUSIVE (null = hasta el fin del ciclo).';
