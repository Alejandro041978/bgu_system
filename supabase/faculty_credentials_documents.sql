-- ============================================================================
-- Documentos adicionales (hasta 3) por docente, en la ficha del colaborador.
-- additional_documents: array jsonb de { url, name }.
-- Ejecutar en Supabase.
-- ============================================================================
alter table faculty_credentials add column if not exists additional_documents jsonb not null default '[]'::jsonb;
