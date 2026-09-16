-- ============================================================================
-- LIMPIEZA DE UN ESTUDIANTE EN UN AULA PARA RECURSADO (MySQL 5.7, vía N8N)
-- ============================================================================
-- Decisión del usuario (16/09/2026): sin plugin de recompletion — el respaldo
-- del intento 1 se SELLA en el ERP (course_retake_requests.first_attempt_
-- snapshot) ANTES de tocar el aula. Esta plantilla deja el aula limpia para
-- que el estudiante rinda el intento 2 desde cero.
--
-- PROTOCOLO (no negociable):
--   1. La solicitud del recursado debe estar ACEPTADA y SELLADA en el ERP
--      (la página Recursados lo exige antes de habilitar la limpieza).
--   2. Reemplazar @USERID (mdl_user.id del estudiante) y @COURSEID (aula).
--   3. Correr PRIMERO el bloque de RESPALDO, verificar los conteos.
--   4. Correr el bloque de LIMPIEZA.
--   5. Verificar RELEYENDO (bloque final) y marcar "aula limpiada" en el ERP.
--
-- Red de seguridad extra: mdl_grade_grades_history conserva las fotos de todo
-- lo borrado (action=3), como se comprobó en los rescates de Espinoza/Carrasco.
-- Lo que NO se toca a propósito: posts de foros (participación histórica) y
-- los archivos subidos (quedan huérfanos de su entrega, sin efecto en notas).
-- ============================================================================

SET @USERID  = 0;   -- ← mdl_user.id
SET @COURSEID = 0;  -- ← aula

-- ── RESPALDO (tablas zz por caso, fechadas) ─────────────────────────────────
CREATE TABLE mdl_zz_rec_gg  AS SELECT gg.* FROM mdl_grade_grades gg
  JOIN mdl_grade_items gi ON gi.id = gg.itemid
  WHERE gg.userid = @USERID AND gi.courseid = @COURSEID;
CREATE TABLE mdl_zz_rec_qa  AS SELECT qa.* FROM mdl_quiz_attempts qa
  JOIN mdl_quiz q ON q.id = qa.quiz WHERE qa.userid = @USERID AND q.course = @COURSEID;
CREATE TABLE mdl_zz_rec_qg  AS SELECT qg.* FROM mdl_quiz_grades qg
  JOIN mdl_quiz q ON q.id = qg.quiz WHERE qg.userid = @USERID AND q.course = @COURSEID;
CREATE TABLE mdl_zz_rec_asub AS SELECT s.* FROM mdl_assign_submission s
  JOIN mdl_assign a ON a.id = s.assignment WHERE s.userid = @USERID AND a.course = @COURSEID;
CREATE TABLE mdl_zz_rec_agr  AS SELECT g.* FROM mdl_assign_grades g
  JOIN mdl_assign a ON a.id = g.assignment WHERE g.userid = @USERID AND a.course = @COURSEID;
CREATE TABLE mdl_zz_rec_cmc AS SELECT c.* FROM mdl_course_modules_completion c
  JOIN mdl_course_modules cm ON cm.id = c.coursemoduleid
  WHERE c.userid = @USERID AND cm.course = @COURSEID;

SELECT (SELECT COUNT(*) FROM mdl_zz_rec_gg)  AS notas,
       (SELECT COUNT(*) FROM mdl_zz_rec_qa)  AS intentos_quiz,
       (SELECT COUNT(*) FROM mdl_zz_rec_qg)  AS notas_quiz,
       (SELECT COUNT(*) FROM mdl_zz_rec_asub) AS entregas,
       (SELECT COUNT(*) FROM mdl_zz_rec_agr)  AS notas_assign,
       (SELECT COUNT(*) FROM mdl_zz_rec_cmc) AS completions;

-- ── LIMPIEZA ────────────────────────────────────────────────────────────────
-- Intentos de quiz (con sus pasos de pregunta) y su nota por quiz
DELETE qas FROM mdl_question_attempt_steps qas
  JOIN mdl_question_attempts qatt ON qatt.questionusageid IN
    (SELECT uniqueid FROM mdl_quiz_attempts WHERE userid = @USERID
       AND quiz IN (SELECT id FROM mdl_quiz WHERE course = @COURSEID))
  WHERE qas.questionattemptid = qatt.id;
DELETE FROM mdl_question_attempts WHERE questionusageid IN
  (SELECT uniqueid FROM mdl_quiz_attempts WHERE userid = @USERID
     AND quiz IN (SELECT id FROM mdl_quiz WHERE course = @COURSEID));
DELETE qa FROM mdl_quiz_attempts qa
  JOIN mdl_quiz q ON q.id = qa.quiz WHERE qa.userid = @USERID AND q.course = @COURSEID;
DELETE qg FROM mdl_quiz_grades qg
  JOIN mdl_quiz q ON q.id = qg.quiz WHERE qg.userid = @USERID AND q.course = @COURSEID;

-- Entregas y notas de assignments
DELETE s FROM mdl_assign_submission s
  JOIN mdl_assign a ON a.id = s.assignment WHERE s.userid = @USERID AND a.course = @COURSEID;
DELETE g FROM mdl_assign_grades g
  JOIN mdl_assign a ON a.id = g.assignment WHERE g.userid = @USERID AND a.course = @COURSEID;

-- Libro de calificaciones del estudiante en el aula (el historial de Moodle
-- guarda la foto sola en grade_grades_history)
DELETE gg FROM mdl_grade_grades gg
  JOIN mdl_grade_items gi ON gi.id = gg.itemid
  WHERE gg.userid = @USERID AND gi.courseid = @COURSEID;

-- Completions (actividades y curso)
DELETE c FROM mdl_course_modules_completion c
  JOIN mdl_course_modules cm ON cm.id = c.coursemoduleid
  WHERE c.userid = @USERID AND cm.course = @COURSEID;
DELETE FROM mdl_course_completions WHERE userid = @USERID AND course = @COURSEID;

-- Recalcular el aula (los totales del estudiante quedan vacíos, no en 0)
UPDATE mdl_grade_items SET needsupdate = 1 WHERE courseid = @COURSEID;

-- ── VERIFICACIÓN releyendo ──────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM mdl_grade_grades gg JOIN mdl_grade_items gi ON gi.id = gg.itemid
    WHERE gg.userid = @USERID AND gi.courseid = @COURSEID) AS notas_restantes,
  (SELECT COUNT(*) FROM mdl_quiz_attempts qa JOIN mdl_quiz q ON q.id = qa.quiz
    WHERE qa.userid = @USERID AND q.course = @COURSEID)    AS intentos_restantes,
  (SELECT COUNT(*) FROM mdl_assign_submission s JOIN mdl_assign a ON a.id = s.assignment
    WHERE s.userid = @USERID AND a.course = @COURSEID)     AS entregas_restantes;
-- Todo debe dar 0. Luego: marcar "aula limpiada" en la página Recursados.
-- Las tablas mdl_zz_rec_* se conservan como respaldo del caso (renombrarlas
-- con fecha si se procesa más de un estudiante: mdl_zz_rec_gg_YYYYMMDD_userid).
