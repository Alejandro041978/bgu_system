-- ============================================================================
-- Programas dictados en el campus de un socio académico.
--   Sus estudiantes acceden al Moodle del socio, NUNCA al nuestro → no son
--   ausentes. Al marcarlo aquí, el recálculo pone situation='campus_socio' a
--   sus matriculados y quedan excluidos de la campaña de retención.
--   Ver [[project_student_situation]].
-- Ejecutar en Supabase.
-- ============================================================================
alter table academic_programs add column if not exists partner_campus boolean not null default false;
