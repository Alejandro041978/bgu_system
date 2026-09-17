-- Cursor de importación por aula (17/09/2026).
-- Las aulas grandes (150+ matriculados) se consultan estudiante por estudiante.
-- Primero van quienes tienen la asignatura abierta en su registro curricular;
-- el resto se recorre POR TURNOS: aquí se guarda el último userid de Moodle
-- consultado, y la corrida siguiente continúa desde ahí. 0 / null = vuelta
-- completa, se empieza de nuevo.
ALTER TABLE moodle_aula_audit
  ADD COLUMN IF NOT EXISTS import_cursor bigint;

COMMENT ON COLUMN moodle_aula_audit.import_cursor IS 'Último userid de Moodle consultado por el importador en el tramo rotativo de un aula grande. 0/null = empieza de nuevo.';
