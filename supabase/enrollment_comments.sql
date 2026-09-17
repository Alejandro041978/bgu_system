-- Comentarios de la matrícula (17/09/2026).
-- La vendedora CARGA, al matricular, dos notas internas que luego LEEN las
-- áreas: la académica (p. ej. "el estudiante pidió convalidar", para
-- Registros) y la económica (p. ej. "tiene un beneficio extra en su plan de
-- pagos", para Finanzas). Son notas internas: nunca se muestran al estudiante.
ALTER TABLE academic_student_enrollments
  ADD COLUMN IF NOT EXISTS academic_comments text,
  ADD COLUMN IF NOT EXISTS financial_comments text;

COMMENT ON COLUMN academic_student_enrollments.academic_comments IS 'Nota interna académica cargada al matricular (convalidaciones pedidas, etc.). No visible para el estudiante.';
COMMENT ON COLUMN academic_student_enrollments.financial_comments IS 'Nota interna económica cargada al matricular (beneficios extra del plan de pagos, etc.). No visible para el estudiante.';
