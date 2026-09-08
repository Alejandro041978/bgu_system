-- ---------------------------------------------------------------------------
-- Categorías del campus excluidas del servicio educativo (07/09/2026).
--
-- El campus tiene categorías organizativas que no son enseñanza (Demo
-- Acreditación, Capacitaciones internas, Aulas de Inducción, Excluidos ERP).
-- Hasta hoy el ERP evaluaba las 706 aulas por igual y esas aparecían en las
-- propuestas de vinculación, en Aulas libres y en los contadores.
--
-- La exclusión es por PREFIJO de la ruta de categoría: excluir "Excluidos ERP"
-- cubre todo lo que cuelga de esa rama. Se administra en Vinculación de
-- Aulas › Categorías.
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS moodle_excluded_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_prefix text NOT NULL UNIQUE,
  excluded_by text,
  excluded_at timestamptz NOT NULL DEFAULT now(),
  nota text
);

ALTER TABLE moodle_excluded_categories ENABLE ROW LEVEL SECURITY;
-- El cierre de seguridad revocó los privilegios por defecto: sin GRANT el rol
-- de servicio recibe "permission denied" (lección del 20/08/2026).
GRANT ALL ON TABLE moodle_excluded_categories TO service_role;

COMMENT ON TABLE moodle_excluded_categories IS
  'Ramas de categorías del campus fuera del servicio educativo: sus aulas no entran a la vinculación ni a los reportes.';

-- Arranque acordado con el usuario (07/09/2026): las ramas ya separadas en Moodle.
INSERT INTO moodle_excluded_categories (category_prefix, excluded_by, nota) VALUES
  ('Excluidos ERP', 'arranque 07/09/2026', 'Rama creada en Moodle para lo que no es servicio educativo (demos de acreditación, capacitaciones internas)'),
  ('Aulas de Inducción', 'arranque 07/09/2026', 'Inducciones: acceso sin calificaciones académicas')
ON CONFLICT (category_prefix) DO NOTHING;
