-- ============================================================================
-- Evaluación externa de idoneidad docente (dictamen previo, sin IA).
-- source: 'ai' (evaluación con Claude) | 'external' (dictamen cargado a mano).
-- Ejecutar en Supabase.
-- ============================================================================
alter table faculty_credentials add column if not exists source text default 'ai';
alter table faculty_credentials add column if not exists external_report_url text;
alter table faculty_credentials add column if not exists external_report_name text;
