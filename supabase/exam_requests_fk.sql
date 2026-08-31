-- ============================================================================
-- Una nota con solicitud de examen colgando NO se puede borrar.
--
-- La limpieza de ceros de Activa (20-08-2026) borró la nota de MAN 370 de
-- Magaly Ochoa sin saber que su subsanación PAGADA apuntaba a esa fila: el
-- acta perdió la asignatura y el registro del examen habría reventado con
-- "Nota no encontrada". Ningún script puede acordarse de todas las
-- referencias — la base sí: esta llave foránea hace que CUALQUIER borrado de
-- una nota referenciada por exam_requests sea rechazado por Postgres, venga
-- de donde venga (limpieza, arbitraje, editor, sync).
--
-- ON DELETE sin acción a propósito: bloquear ES el comportamiento deseado.
-- Quien de verdad necesite borrar esa nota debe anular primero la solicitud.
--
-- Ejecutar en Supabase.
-- ============================================================================

-- Control previo: no debe existir ninguna solicitud apuntando a una nota
-- borrada (la de Ochoa ya fue restaurada). Debe devolver 0.
select count(*) as solicitudes_con_nota_borrada_debe_ser_0
  from exam_requests er
 where er.grade_external_id is not null
   and not exists (select 1 from academic_grades g where g.external_id = er.grade_external_id);

alter table exam_requests
  add constraint exam_requests_grade_external_id_fkey
  foreign key (grade_external_id) references academic_grades(external_id);

-- Verificación: la restricción existe.
select conname from pg_constraint where conname = 'exam_requests_grade_external_id_fkey';
