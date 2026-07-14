-- ============================================================================
-- Etiqueta de referencia (ej. "Caso #123") en las conversaciones grabadas para
-- el supervisor, para que el reporte diario pueda citar el número de caso.
-- Ejecutar en Supabase.
-- ============================================================================
alter table sofia_conversations add column if not exists ref_label text;
