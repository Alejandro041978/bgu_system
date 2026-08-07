-- ===========================================================================
-- aplicar_politica_notas v2: la política juzga NOTAS, no cualquier UPDATE
--
-- La política impide que una nota de Moodle pise una nota de SystemActiva ya
-- calificada, y lo hace con `return null`: descarta la fila sin abortar el
-- lote. Correcto para una importación.
--
-- Pero el trigger es `before insert or update` y no distingue qué se está
-- escribiendo, así que descartaba TAMBIÉN los updates que no tocan la
-- calificación. Se vio al vaciar los mínimos heredados: una fila —HCM 600 de
-- Katherine Dominguez— se negaba a soltar su passing_score, el UPDATE
-- respondía "ok" y el valor seguía ahí. Acumula 35 rechazos registrados, uno
-- por cada intento.
--
-- Es el segundo guardián del día que bloquea de más en silencio (el otro fue
-- protect_edited_grades con passing_score). El patrón se repite: una guardia
-- escrita para un escenario acaba aplicándose a todos, y lo que impide no
-- avisa — simplemente no ocurre.
--
-- Ahora un UPDATE que deja la calificación intacta pasa: no está escribiendo
-- una nota, así que no hay nada que juzgar. Los INSERT y los updates que sí
-- cambian la nota siguen bajo la misma política de siempre.
-- ===========================================================================

create or replace function aplicar_politica_notas() returns trigger
language plpgsql
as $$
declare
  v_intento  smallint;
  v_activa   boolean;
begin
  -- Un UPDATE que no cambia la calificación no está escribiendo una nota:
  -- es mantenimiento (course_id, passing_score, metadatos). Se deja pasar.
  if TG_OP = 'UPDATE'
     and new.final_grade  is not distinct from old.final_grade
     and new.retake_grade is not distinct from old.retake_grade then
    return new;
  end if;

  -- Sólo se juzga lo que llega del campus. Las notas de SystemActiva, las
  -- convalidaciones y las ediciones humanas no pasan por esta puerta.
  if new.source is distinct from 'moodle' then
    return new;
  end if;

  -- Sin asignatura resuelta no hay nada contra qué comparar. Se deja pasar:
  -- rechazar por no saber convertiría cada nombre no emparejado en una nota
  -- perdida en silencio. Estas quedan visibles por course_id null.
  if new.course_id is null then
    return new;
  end if;

  -- ¿La asignatura ya tiene nota de SystemActiva? Una fila de Activa SIN
  -- calificar es una matrícula en curso, no una nota: esa sí se puede rellenar.
  select exists (
    select 1
      from academic_grades g
     where g.course_id = new.course_id
       and g.document_number is not distinct from new.document_number
       and g.source = 'systemactiva'
       and g.external_id is distinct from new.external_id
       and coalesce(g.retake_grade, g.final_grade) is not null
  ) into v_activa;

  if not v_activa then
    return new;
  end if;

  -- Existe nota de Activa. Lo único que autoriza escribir es que esta nota
  -- pertenezca a un segundo intento: el estudiante lleva la asignatura de nuevo.
  select ace.attempt into v_intento
    from academic_course_enrollments ace
   where ace.id = new.course_enrollment_id;

  if coalesce(v_intento, 1) >= 2 then
    return new;
  end if;

  insert into grade_policy_rejections
    (document_number, course_id, course_code, course_name, source, final_grade, moodle_course_id, motivo)
  values
    (new.document_number, new.course_id, new.course_code, new.course_name, new.source,
     coalesce(new.retake_grade, new.final_grade), new.moodle_course_id,
     case when new.course_enrollment_id is null
          then 'La asignatura ya tiene nota de SystemActiva y esta nota no está asociada a ninguna matrícula'
          else 'La asignatura ya tiene nota de SystemActiva y esta matrícula es el primer intento' end);

  -- Descarta la fila sin abortar el lote.
  return null;
end $$;

-- La última que faltaba.
update academic_grades set passing_score = null where passing_score is not null;

select 'notas con mínimo propio (debe ser 0)' as control, count(*)::text as valor
  from academic_grades where passing_score is not null
union all
select 'detalles con mínimo propio (debe ser 0)', count(*)::text
  from academic_grade_details where passing_score is not null;
