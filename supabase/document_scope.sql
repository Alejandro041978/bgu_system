-- ============================================================================
-- Emisión de documentos — alcance/disponibilidad por tipo de documento.
--   Un tipo puede estar disponible para todos, para una categoría, o para
--   programas específicos.
--     scope_category_id set           → solo esa categoría
--     scope_program_ids no vacío      → solo esos programas (tiene prioridad)
--     ambos vacíos                    → todos
-- Ejecutar en Supabase.
-- ============================================================================
alter table document_types add column if not exists scope_category_id uuid references academic_programs_category(id);
alter table document_types add column if not exists scope_program_ids jsonb not null default '[]'::jsonb;
