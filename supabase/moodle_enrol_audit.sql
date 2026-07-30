-- ===========================================================================
-- Auditor del campus · métodos de matriculación por aula
--
-- Caso que lo motiva (aula 669, Módulo 05 - CEPAC, 30-07-2026): el ERP
-- matricula con `enrol_manual_enrol_users`, y esa función de Moodle EXIGE que
-- el curso tenga habilitado el método "Matriculaciones manuales". El aula 669
-- solo tenía self enrolment, así que:
--
--   ERP no puede matricular → el aula se queda sin estudiantes → la importación
--   entra, no encuentra alumnos y sale SIN ERROR → 75 estudiantes con la
--   asignatura "En proceso" para siempre.
--
-- Nada de eso era visible: `last_import_at` se actualizaba igual que en un aula
-- sana. Estas dos columnas lo convierten en un dato del auditor.
--
-- Ejecutar en Supabase.
-- ===========================================================================

-- Métodos de matriculación tal como los reporta Moodle ("manual:activo, self:activo").
alter table moodle_aula_audit add column if not exists enrol_methods text;

-- ¿Puede el ERP matricular en esta aula? false = matriculación manual ausente
-- o deshabilitada. null = no se pudo consultar.
alter table moodle_aula_audit add column if not exists manual_enrol boolean;

-- Estudiantes matriculados (0 con estudiantes esperando = el síntoma silencioso).
alter table moodle_aula_audit add column if not exists matriculados int;

create index if not exists moodle_aula_audit_manual_idx on moodle_aula_audit (manual_enrol)
  where manual_enrol is not true;
