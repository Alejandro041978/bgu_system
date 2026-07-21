-- Suma aritmética de coeficientes por aula (sincronizada desde la BD de
-- Moodle vía N8N). El Auditor la prefiere sobre el peso normalizado del WS.
alter table moodle_aula_audit add column if not exists suma_coeficientes numeric;
alter table moodle_aula_audit add column if not exists coefs_sync_at timestamptz;
