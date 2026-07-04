-- Plan de Efectividad v2
-- Ejecutar en Supabase SQL Editor

-- 1. Ajustar effectiveness_kpis: quitar target y responsible_id, agregar value_type
ALTER TABLE effectiveness_kpis DROP COLUMN IF EXISTS target;
ALTER TABLE effectiveness_kpis DROP COLUMN IF EXISTS responsible_id;
ALTER TABLE effectiveness_kpis ADD COLUMN IF NOT EXISTS value_type text NOT NULL DEFAULT 'decimal'
  CHECK (value_type IN ('porcentaje', 'entero', 'decimal'));

-- 2. Tabla pivote plan ↔ kpi (con vinculación al plan estratégico)
CREATE TABLE IF NOT EXISTS effectiveness_plan_kpis (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              uuid NOT NULL REFERENCES effectiveness_plans(id) ON DELETE CASCADE,
  kpi_id               uuid NOT NULL REFERENCES effectiveness_kpis(id) ON DELETE CASCADE,
  link_type            text CHECK (link_type IN ('objetivo','accion_estrategica','accion_responsable')),
  link_id              uuid,
  meta                 numeric,
  responsible_id       uuid REFERENCES hr_employees(id) ON DELETE SET NULL,
  resultado            numeric,
  resultado_updated_at date,
  created_at           timestamptz DEFAULT now()
);
