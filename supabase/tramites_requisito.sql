-- ===========================================================================
-- Trámites · requisito de situación del estudiante
--
-- Re-entry solo puede pedirlo quien está en IW: es un REINGRESO, así que
-- pedirlo estando activo no significa nada, y estando egresado tampoco.
--
-- Se guarda en el catálogo y no en el código porque el siguiente trámite tendrá
-- su propio requisito (un LOA que quiere volver, un egresado que pide algo)
-- y no debería hacer falta un despliegue para expresarlo.
--
-- Ejecutar en Supabase DESPUÉS de tramites.sql.
-- ===========================================================================

-- Situación exigida (valor de academic_students.situation). Nulo = sin
-- requisito de situación.
alter table tramite_types add column if not exists requires_situation text;

-- Texto que se le muestra a quien NO cumple. Sin esto el estudiante solo vería
-- un botón deshabilitado sin saber por qué.
alter table tramite_types add column if not exists requires_situation_note text;

update tramite_types
   set price = 35,
       requires_situation = 'IW',
       requires_situation_note = 'El reingreso solo pueden solicitarlo los estudiantes con una interrupción de estudios (IW) activa.',
       updated_at = now()
 where name = 'Re-entry';
