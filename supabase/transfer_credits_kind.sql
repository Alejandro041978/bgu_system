-- ============================================================================
-- Discriminador convalidación vs validación en el mismo módulo (transfer_credits).
-- kind = 'convalidacion' (Transfer Credit) | 'validacion' (Validation).
-- Ejecutar en Supabase.
-- ============================================================================
alter table transfer_credits add column if not exists kind text not null default 'convalidacion';
