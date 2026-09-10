-- ---------------------------------------------------------------------------
-- Simplificación del Plan Estratégico (10/09/2026, decisión de Dirección).
--
-- El plan queda en 4 niveles: dimensión > objetivo > estrategia > acción
-- estratégica. El quinto nivel ("actividades" = strategic_action_responsibles
-- con código/nombre propios) se retira: la ACCIÓN pasa a ser la unidad de
-- reporte. strategic_action_responsibles sobrevive como asignación pura de
-- responsables (persona + rol principal/apoyo, sin identidad de actividad).
--
-- Nuevas piezas:
--   · strategic_action_years    — años de ejecución de cada acción
--   · strategic_action_progress — avance anual POR ACCIÓN (único por año)
--
-- Correr en el SQL Editor de Supabase. Después de correrla, Claude ejecuta el
-- guion de datos (respaldo + colapso de las 109 actividades).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS strategic_action_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES strategic_actions(id) ON DELETE CASCADE,
  year int NOT NULL,
  UNIQUE (action_id, year)
);

CREATE TABLE IF NOT EXISTS strategic_action_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES strategic_actions(id) ON DELETE CASCADE,
  year int NOT NULL,
  status text NOT NULL DEFAULT 'active',
  progress_pct numeric,
  notes text,
  reported_by uuid REFERENCES hr_employees(id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  -- Un avance por acción y año: el reporte se corrige, no se duplica.
  UNIQUE (action_id, year)
);

ALTER TABLE strategic_action_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_action_progress ENABLE ROW LEVEL SECURITY;
-- Sin GRANT, el rol de servicio recibe "permission denied" (lección 20/08/2026).
GRANT ALL ON TABLE strategic_action_years TO service_role;
GRANT ALL ON TABLE strategic_action_progress TO service_role;

COMMENT ON TABLE strategic_action_progress IS
  'Avance anual del plan estratégico por ACCIÓN (la unidad de reporte desde el 10/09/2026; las actividades se retiraron).';
