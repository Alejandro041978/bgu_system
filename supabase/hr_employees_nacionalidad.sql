-- ============================================================================
-- Asegura la columna nacionalidad en hr_employees (el formulario la usa pero
-- podría no existir). Ejecutar en Supabase.
-- ============================================================================
alter table hr_employees add column if not exists nacionalidad text;
