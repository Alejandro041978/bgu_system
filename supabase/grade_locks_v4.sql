-- ===========================================================================
-- protect_edited_grades v4: una nota VACÍA no es un acta que proteger
--
-- Registros vacía a mano la nota heredada de Activa para que Moodle traiga la
-- verdadera. Es el procedimiento correcto — y era imposible: vaciarla desde el
-- ERP marca edited_at, y el trigger congelaba final_grade a partir de ese
-- momento. El importador escribía, el trigger devolvía el null de siempre, y
-- nadie veía un error. Hoy hay 97 notas atrapadas así.
--
-- La protección tiene sentido cuando hay una calificación humana que defender
-- de una importación. Cuando la calificación es NULL no hay nada que defender:
-- es un hueco esperando a que Moodle lo llene, que es exactamente lo que
-- Registros quiso decir al vaciarla.
--
-- edited_at se conserva: sigue siendo el rastro de quién tocó la fila. Lo que
-- cambia es que dejar de tener nota deja de blindar el hueco.
-- ===========================================================================

create or replace function protect_edited_grades() returns trigger as $$
begin
  if (old.edited_at is not null or old.locked_at is not null)
     and new.edited_at is not distinct from old.edited_at
     and new.locked_at is not distinct from old.locked_at then

    -- La calificación se protege SOLO si existe. Un null no es un acta.
    if old.final_grade is not null then
      new.final_grade := old.final_grade;
    end if;
    if old.retake_grade is not null then
      new.retake_grade := old.retake_grade;
    end if;

    -- A quién y a qué corresponde: eso no cambia nunca por una importación.
    new.course_name      := old.course_name;
    new.course_code      := old.course_code;
    new.term_year        := old.term_year;
    new.term_block       := old.term_block;
    new.document_number  := old.document_number;
    new.source           := old.source;
    new.withdrawn_at     := old.withdrawn_at;
    new.withdrawn_by     := old.withdrawn_by;

    -- passing_score no se congela desde la v3: es regla, no acta.
    return new;
  end if;
  return new;
end;
$$ language plpgsql;

select 'notas vaciadas a mano, ahora importables' as control, count(*)::text as valor
  from academic_grades
 where edited_at is not null and final_grade is null and retake_grade is null
union all
select 'notas editadas CON calificación (siguen blindadas)', count(*)::text
  from academic_grades
 where edited_at is not null and (final_grade is not null or retake_grade is not null);
