-- ============================================================================
-- Los grupos se asocian a PROGRAMA (no a semestre/año). Se agregan campos
-- descriptivos: abbreviation (abreviatura), name (denominación), detail (detalle).
-- Ejecutar en Supabase.
-- ============================================================================
alter table academic_groups add column if not exists abbreviation text;
alter table academic_groups add column if not exists detail text;
alter table academic_groups drop column if exists semester_id;
