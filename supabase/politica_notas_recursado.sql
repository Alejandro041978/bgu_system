-- La política de notas bloqueaba TODOS los recursados.
--
-- El disparador trg_politica_notas impide que una nota de Moodle pise una nota
-- de SystemActiva ya calificada, y hace bien: son dos sistemas escribiendo
-- sobre la misma asignatura. La excepción prevista es el segundo intento — el
-- estudiante vuelve a cursar y esa nota nueva sí debe entrar.
--
-- Pero el intento se leía SOLO de la matrícula:
--
--     select ace.attempt into v_intento
--       from academic_course_enrollments ace
--      where ace.id = new.course_enrollment_id;
--
-- y el importador de Moodle NO escribe course_enrollment_id en la nota: crea la
-- matrícula DESPUÉS, en la misma corrida, porque hasta entonces no sabe si la
-- nota va a entrar. Así que v_intento salía null, coalesce lo convertía en 1, y
-- todos los recursados se descartaban.
--
-- En silencio, además: la fila se anota en grade_policy_rejections y el
-- INSERT devuelve "sin error", así que la importación anunciaba "9 notas
-- nuevas" sin haber escrito ninguna. Eran 99 notas al descubrirlo, 38 de ellas
-- del mismo día (20/08/2026).
--
-- academic_grades.intento ya lleva el número de intento y el importador lo
-- rellena (2, 3, …). Es el dato que la fila conoce de sí misma; la matrícula
-- queda como respaldo para las notas que sí la traen.
create or replace function aplicar_politica_notas() returns trigger as $$
declare
  v_activa boolean;
  v_intento int;
begin
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
-- Cuántas de las 99 rechazadas hasta hoy entrarían ya con la regla nueva.
-- No las repone: hay que volver a importar esas aulas, que es idempotente.
select count(*) as rechazadas_que_eran_recursados
  from grade_policy_rejections
 where motivo like '%no está asociada a ninguna matrícula%';
