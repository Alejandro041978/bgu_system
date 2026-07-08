-- ============================================================================
-- Eliminar columnas no usadas de convocatorias: registration_start_date y end_date.
-- (No las usa ningún módulo del ERP.) Ejecutar en Supabase.
-- ============================================================================
alter table convocatorias drop column if exists registration_start_date;
alter table convocatorias drop column if exists end_date;
