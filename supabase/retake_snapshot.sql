-- Sello del intento 1 en el ERP + constancia de limpieza del aula (16/09/2026).
-- Decisión del usuario: SIN plugin de recompletion — el respaldo del primer
-- intento vive en el ERP. Al aceptarse la solicitud (pago completo), el ERP
-- captura y SELLA el intento 1 completo (cada evaluación con su nombre,
-- ponderación, calificación y FECHA, leídas del aula en vivo; el acumulado
-- final y el estado desaprobado). Solo con el sello puesto se procede a
-- limpiar al estudiante en el aula del LMS para el intento 2.
ALTER TABLE course_retake_requests
  ADD COLUMN IF NOT EXISTS first_attempt_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS sealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sealed_by text,
  ADD COLUMN IF NOT EXISTS lms_cleaned_at timestamptz,
  ADD COLUMN IF NOT EXISTS lms_cleaned_by text;

COMMENT ON COLUMN course_retake_requests.first_attempt_snapshot IS 'Respaldo sellado e inmutable del intento 1: evaluaciones con fecha, bonos, acumulado, mínimo y estado. Fuente moodle_vivo (aula leída al sellar) o erp_acta (sin aula, p. ej. intentos de SystemActiva).';
COMMENT ON COLUMN course_retake_requests.lms_cleaned_at IS 'Constancia de que el estudiante fue limpiado en el aula (notas, intentos de quiz, entregas) tras el sello; el aula queda lista para el intento 2.';
