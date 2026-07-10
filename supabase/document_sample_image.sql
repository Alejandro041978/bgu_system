-- ============================================================================
-- Imagen de ejemplo (JPG) del documento, para que el estudiante vea una vista
-- previa antes de solicitarlo/comprarlo.
-- Ejecutar en Supabase.
-- ============================================================================
alter table document_types add column if not exists sample_image_url text;
