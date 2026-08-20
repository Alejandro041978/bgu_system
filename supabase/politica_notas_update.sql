-- La política también congelaba las notas de Moodle que ya existían.
--
-- trg_politica_notas corre BEFORE INSERT OR UPDATE. Su propósito es impedir que
-- una nota de Moodle cree una SEGUNDA calificación sobre una asignatura que ya
-- tiene nota de SystemActiva. Eso está bien en el INSERT.
--
-- En el UPDATE no impide nada: la fila ya existe, ya pasó la política el día que
-- se creó (o es anterior a ella). Lo único que consigue bloquearla es que el
-- valor se quede clavado — el profesor corrige la nota en el campus, la
-- importación la trae, y el disparador la descarta en silencio.
--
-- Son 170 notas en 55 aulas, y se descubrió porque reimportar el aula 340 anotó
-- 13 rechazos nuevos de alumnos que ya tenían su nota de Moodle escrita
-- (20/08/2026).
--
-- Se sigue vigilando el caso peligroso: que un UPDATE MUEVA la nota a otra
-- asignatura y la cuele por la puerta de atrás. Si course_id cambia, la fila
-- vuelve a medirse contra la política como si naciera ahora.
create or replace function aplicar_politica_notas() returns trigger as $$
declare
  v_activa boolean;
  v_intento int;
begin
  -- Actualizar una fila que ya existe no crea ninguna nota nueva: no hay nada
  -- que la política deba impedir. Salvo que se le cambie la asignatura, que sí
  -- es crear una nota en otro sitio.
  if TG_OP = 'UPDATE' and new.course_id is not distinct from old.course_id then
    return new;
  end if;

  -- Sin asignatura resuelta no se dictamina: rechazar por no saber convertiría
  -- cada nombre no emparejado en una nota perdida en silencio. Estas quedan
  -- visibles por course_id null.
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

  -- El intento de la PROPIA fila manda, y la matrícula queda de respaldo.
  if coalesce(new.intento, v_intento, 1) >= 2 then
    return new;
  end if;

  insert into grade_policy_rejections
    (document_number, course_id, course_code, course_name, source, final_grade, moodle_course_id, motivo)
  values
    (new.document_number, new.course_id, new.course_code, new.course_name, new.source,
     coalesce(new.retake_grade, new.final_grade), new.moodle_course_id,
     case when new.course_enrollment_id is null and new.intento is null
          then 'La asignatura ya tiene nota de SystemActiva y esta nota no dice de qué intento es'
          else 'La asignatura ya tiene nota de SystemActiva y esta nota es del primer intento' end);

  -- Descarta la fila sin abortar el lote.
  return null;
end $$ language plpgsql;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Notas de Moodle que estaban congeladas y vuelven a poder actualizarse.
-- No cambia ningún valor: hay que reimportar sus aulas para que se refresquen.
select count(*) as notas_de_moodle_que_se_descongelan
  from academic_grades m
  join academic_grades a
    on a.course_id = m.course_id
   and a.document_number is not distinct from m.document_number
   and a.source = 'systemactiva'
   and a.external_id is distinct from m.external_id
   and coalesce(a.retake_grade, a.final_grade) is not null
 where m.source in ('moodle', 'csv')
   and m.course_id is not null
   and m.withdrawn_at is null
   and coalesce(m.intento, 1) < 2;
