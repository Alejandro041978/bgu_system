-- ============================================================================
-- Cuotas creadas manualmente desde el ERP: campo de referencia libre.
-- (SystemActiva no lo traía; las cuotas nativas sí lo necesitan.)
-- Ejecutar en Supabase.
-- ============================================================================
alter table account_charges add column if not exists reference text;
