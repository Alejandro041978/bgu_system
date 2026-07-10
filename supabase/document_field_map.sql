-- ============================================================================
-- Emisión de documentos — mapeo de merge tags por tipo de documento.
--   Cada plantilla de SimpleCert tiene sus propios merge tags; este mapa dice
--   qué merge tag se llena con qué dato del ERP (o un texto fijo).
--   field_map = [{ tag:'COD_MAT', source:'document_number' } | { tag:'HOURS', source:'literal', value:'480' }]
-- Ejecutar en Supabase.
-- ============================================================================
alter table document_types add column if not exists field_map jsonb not null default '[]'::jsonb;
