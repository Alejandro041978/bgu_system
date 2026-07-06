-- ============================================================================
-- Tema/especialidad en los códigos de handoff (para enrutar los WhatsApp derivados por Sofia).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

alter table handoff_codes add column if not exists topic text;
