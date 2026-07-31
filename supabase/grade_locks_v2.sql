-- ===========================================================================
-- El escudo protege la NOTA, no la fila
--
-- protect_edited_grades hacía `return old`: ante cualquier UPDATE sobre una
-- fila con edited_at o locked_at, descartaba la fila entrante COMPLETA. Eso
-- protege la calificación, sí, pero también congela columnas que no tienen
-- nada que ver con ella.
--
-- Se vio al enlazar las notas con la matrícula por asignatura: 992 de 21.272
-- notas se quedaron sin course_id, y son exactamente las 992 que tienen
-- edited_at. El trigger las bloqueó en silencio — sin error, sin rastro.
-- Ninguna migración futura podría tocarlas nunca.
--
-- Ahora congela columna por columna lo que constituye el acta —quién, qué
-- asignatura, qué periodo, qué calificación— y deja pasar el resto.
-- ===========================================================================

create or replace function protect_edited_grades() returns trigger as $$
begin
  if (old.edited_at is not null or old.locked_at is not null)
     and new.edited_at is not distinct from old.edited_at
     and new.locked_at is not distinct from old.locked_at then

    -- El acta: la calificación y a quién y a qué corresponde. Intocable por
    -- cualquier importación, igual que antes.
    new.final_grade      := old.final_grade;
    new.retake_grade     := old.retake_grade;
    new.course_name      := old.course_name;
    new.course_code      := old.course_code;
    new.passing_score    := old.passing_score;
    new.term_year        := old.term_year;
    new.term_block       := old.term_block;
    new.document_number  := old.document_number;
    new.source           := old.source;
    new.withdrawn_at     := old.withdrawn_at;
    new.withdrawn_by     := old.withdrawn_by;

    -- Todo lo demás pasa: course_id, course_enrollment_id, synced_at,
    -- moodle_course_id, updated_at. Son metadatos de conexión y de rastro, no
    -- el contenido del acta.
    return new;
  end if;
  return new;
end;
$$ language plpgsql;


-- ── Verificación ───────────────────────────────────────────────────────────
-- Debe seguir dando 0: ninguna nota protegida cambió de calificación.
select count(*) as notas_protegidas from academic_grades
 where edited_at is not null or locked_at is not null;
