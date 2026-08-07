-- ===========================================================================
-- protect_edited_grades v3: la nota mínima sale del acta protegida
--
-- El trigger congela columna por columna lo que constituye el acta de una nota
-- editada o cerrada. Entre esas columnas estaba passing_score, y por eso el
-- vaciado de los mínimos heredados de SystemActiva no llegaba a 1.617 filas:
-- el trigger devolvía el valor viejo SIN ERROR Y SIN RASTRO. Se corrió tres
-- veces y tres veces dio el mismo número.
--
-- Es el mismo comportamiento que obligó a la v2 cuando bloqueó 992 course_id.
-- La lección se repite: lo que el trigger congela de más no avisa, solo no
-- ocurre.
--
-- Pero además congelarlo estaba mal de fondo. Lo que hay que proteger es la
-- CALIFICACIÓN y a quién y a qué corresponde. El mínimo aprobatorio no es eso:
-- es la regla de la institución, vive en la categoría del programa y se aplica
-- al leer. Congelarlo en la fila significaba que una nota cerrada conservaba
-- para siempre la regla del sistema del que vino — justo lo que estamos
-- quitando.
--
-- La calificación sigue intocable: final_grade y retake_grade no se mueven.
-- ===========================================================================

create or replace function protect_edited_grades() returns trigger as $$
begin
  if (old.edited_at is not null or old.locked_at is not null)
     and new.edited_at is not distinct from old.edited_at
     and new.locked_at is not distinct from old.locked_at then

    -- El acta: la calificación y a quién y a qué corresponde.
    new.final_grade      := old.final_grade;
    new.retake_grade     := old.retake_grade;
    new.course_name      := old.course_name;
    new.course_code      := old.course_code;
    new.term_year        := old.term_year;
    new.term_block       := old.term_block;
    new.document_number  := old.document_number;
    new.source           := old.source;
    new.withdrawn_at     := old.withdrawn_at;
    new.withdrawn_by     := old.withdrawn_by;

    -- passing_score YA NO se congela: es regla, no acta.
    return new;
  end if;
  return new;
end;
$$ language plpgsql;

-- Ahora sí, el vaciado alcanza a todas.
update academic_grades set passing_score = null where passing_score is not null;
update academic_grade_details set passing_score = null where passing_score is not null;

select 'notas con mínimo propio (debe ser 0)' as control, count(*)::text as valor
  from academic_grades where passing_score is not null
union all
select 'detalles con mínimo propio (debe ser 0)', count(*)::text
  from academic_grade_details where passing_score is not null
union all
select 'notas protegidas (no cambia: siguen protegidas en su CALIFICACIÓN)', count(*)::text
  from academic_grades where edited_at is not null or locked_at is not null;
