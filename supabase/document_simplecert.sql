-- ============================================================================
-- Emisión de documentos — integración con SimpleCert (Parte 3/4)
--   Cada tipo de documento se vincula a un Project de SimpleCert (plantilla).
--   Al emitir, se crea un "recipient" en ese project y se guarda el PDF (URL).
-- Ejecutar en Supabase.
-- ============================================================================

-- Project de SimpleCert que genera el PDF de este tipo de documento.
alter table document_types add column if not exists simplecert_project_id text;

-- Marca de emisión del documento.
alter table document_requests add column if not exists emitted_at timestamptz;
