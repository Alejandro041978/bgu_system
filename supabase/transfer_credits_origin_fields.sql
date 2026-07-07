-- ============================================================================
-- Convalidaciones: número y créditos de la asignatura de ORIGEN
-- (para el Transfer Credit Evaluation Form). Ejecutar en Supabase.
-- ============================================================================
alter table transfer_credit_items add column if not exists origin_course_code text;
alter table transfer_credit_items add column if not exists origin_credits numeric;

alter table transfer_scheme_items add column if not exists origin_course_code text;
alter table transfer_scheme_items add column if not exists origin_credits numeric;
