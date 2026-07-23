-- Rotación justa del cron de importación de actas: cada intento (con o sin
-- cambios, aceptado o rechazado) deja huella, y la siguiente corrida empieza
-- por las aulas menos recientes. Sin esto, un aula lenta y sin cambios iría
-- primera en TODAS las corridas y el resto nunca avanzaría.
-- Ejecutar con "Run and enable RLS" (solo agrega columna).
alter table moodle_aula_audit add column if not exists last_import_at timestamptz;
