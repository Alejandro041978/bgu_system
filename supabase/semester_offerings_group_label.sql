-- ============================================================================
-- Etiqueta de grupo por curso ofertado (para distinguir grupos/slots de una
-- misma asignatura en un semestre). Sirve además como filtro en Oferta y Cronogramas.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

alter table semester_offerings add column if not exists group_label text;
