-- Plan de Efectividad: planes y sus KPIs

CREATE TABLE IF NOT EXISTS effectiveness_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  year int NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS effectiveness_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES effectiveness_plans(id) ON DELETE CASCADE,
  code text NOT NULL,
  level text NOT NULL CHECK (level IN ('institucional', 'estrategico', 'operativo')),
  name text NOT NULL,
  formula text,
  target text,
  responsible_id uuid REFERENCES hr_employees(id) ON DELETE SET NULL,
  frequency text NOT NULL DEFAULT 'anual' CHECK (frequency IN ('anual', 'semestral')),
  created_at timestamptz DEFAULT now()
);
