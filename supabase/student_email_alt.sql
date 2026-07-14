-- ============================================================================
-- Segundo correo del estudiante (personal / alternativo).
--   En SystemActiva los estudiantes tienen 2 correos (institucional y personal)
--   y en Moodle pueden usar cualquiera. Guardamos el segundo para poder cruzar
--   la actividad en Moodle por ambos correos.
--   Poblarlo desde el sync de N8N (mapear el 2º correo de SystemActiva aquí).
-- Ejecutar en Supabase.
-- ============================================================================
alter table academic_students add column if not exists email_alt text;
