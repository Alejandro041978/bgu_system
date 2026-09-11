-- ---------------------------------------------------------------------------
-- Encuesta de titulados (Survey Titulados, 10/09/2026).
--
-- Camila invita por WhatsApp a los TITULADOS de programas oficiales
-- (Bachelor/Master/Doctoral) con un enlace único por estudiante. La encuesta
-- vive en el ERP (/form/graduate-survey/<token>) y es NOMINAL: el token
-- identifica al estudiante para los cruces (programa, categoría, país…).
-- Completada, el estudiante descansa hasta el AÑO ACADÉMICO siguiente: el
-- resultado del año = todas las completadas dentro de ese año (sep–ago).
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS graduate_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- el token del enlace
  student_id uuid NOT NULL REFERENCES academic_students(id),
  program_id uuid,                                  -- programa del título (foto al invitar)
  language text NOT NULL DEFAULT 'es',
  created_at timestamptz NOT NULL DEFAULT now(),    -- invitación creada
  completed_at timestamptz,                         -- null = pendiente
  academic_year_id uuid REFERENCES academic_years(id), -- año académico de la COMPLETACIÓN
  answers jsonb                                     -- respuestas (versión 1 del cuestionario)
);

CREATE INDEX IF NOT EXISTS idx_graduate_surveys_student ON graduate_surveys (student_id);
CREATE INDEX IF NOT EXISTS idx_graduate_surveys_year ON graduate_surveys (academic_year_id) WHERE completed_at IS NOT NULL;

ALTER TABLE graduate_surveys ENABLE ROW LEVEL SECURITY;
-- Sin GRANT, el rol de servicio recibe "permission denied" (lección 20/08/2026).
GRANT ALL ON TABLE graduate_surveys TO service_role;

COMMENT ON TABLE graduate_surveys IS
  'Encuesta anual de titulados: una invitación tokenizada por estudiante; el resultado se agrega por el año académico en que se completó.';
