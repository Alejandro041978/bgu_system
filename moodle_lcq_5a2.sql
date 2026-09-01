-- ============================================================================
-- LIVE CLASS QUIZ: de 5 a 2 puntos extra (decisión del usuario, 01-09-2026)
-- Reescalado PROPORCIONAL de las notas puestas (nota × 2/5).
-- MySQL 5.7 · un statement por nodo N8N · prefijo mdl_
-- ORDEN: censo (0-3) → respaldo (R1-R4) → aplicar (A1-A5) → verificar (V1-V3)
-- Pegar los resultados de cada etapa antes de correr la siguiente.
-- ============================================================================

-- PASO 0 · credenciales (debe devolver "ECT 103…" y "Ciberdefensa…"; si no, DETENERSE)
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);

-- PASO 1 · distribución de los ítems Live Class Quiz
SELECT gi.grademax, gi.aggregationcoef, gi.aggregationcoef2,
  COUNT(*) AS items, COUNT(DISTINCT gi.courseid) AS aulas
FROM mdl_grade_items gi
WHERE gi.itemtype = 'mod' AND gi.itemmodule = 'quiz'
  AND gi.itemname LIKE 'Live Class Quiz%'
GROUP BY gi.grademax, gi.aggregationcoef, gi.aggregationcoef2;

-- PASO 2 · notas puestas sobre esos ítems
SELECT COUNT(*) AS notas_puestas,
  SUM(CASE WHEN gg.finalgrade > 2 THEN 1 ELSE 0 END) AS mayores_a_2,
  ROUND(AVG(gg.finalgrade), 2) AS promedio
FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
WHERE gi.itemtype = 'mod' AND gi.itemmodule = 'quiz'
  AND gi.itemname LIKE 'Live Class Quiz%'
  AND gg.finalgrade IS NOT NULL;

-- PASO 3 · los quizzes como actividad
SELECT q.grade AS maximo_actividad, COUNT(*) AS quizzes
FROM mdl_quiz q
WHERE q.name LIKE 'Live Class Quiz%'
GROUP BY q.grade;

-- ============================================================================
-- RESPALDO (tablas espejo dentro de la misma base; el deshacer es restaurar
-- desde ellas). Correr los cuatro y confirmar que cada CREATE devolvió filas.
-- ============================================================================

-- R1 · ítems del libro de calificaciones
CREATE TABLE mdl_zz_bak_lcq_items_20260901 AS
SELECT * FROM mdl_grade_items
WHERE itemtype = 'mod' AND itemmodule = 'quiz' AND itemname LIKE 'Live Class Quiz%';

-- R2 · notas del libro sobre esos ítems
CREATE TABLE mdl_zz_bak_lcq_grades_20260901 AS
SELECT gg.* FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
WHERE gi.itemtype = 'mod' AND gi.itemmodule = 'quiz' AND gi.itemname LIKE 'Live Class Quiz%';

-- R3 · los quizzes como actividad
CREATE TABLE mdl_zz_bak_lcq_quiz_20260901 AS
SELECT * FROM mdl_quiz WHERE name LIKE 'Live Class Quiz%';

-- R4 · notas del módulo quiz
CREATE TABLE mdl_zz_bak_lcq_qgrades_20260901 AS
SELECT qg.* FROM mdl_quiz_grades qg
JOIN mdl_quiz q ON q.id = qg.quiz
WHERE q.name LIKE 'Live Class Quiz%';

-- Confirmación del respaldo (cuatro conteos > 0, coherentes con el censo):
SELECT
  (SELECT COUNT(*) FROM mdl_zz_bak_lcq_items_20260901)   AS bak_items,
  (SELECT COUNT(*) FROM mdl_zz_bak_lcq_grades_20260901)  AS bak_grades,
  (SELECT COUNT(*) FROM mdl_zz_bak_lcq_quiz_20260901)    AS bak_quiz,
  (SELECT COUNT(*) FROM mdl_zz_bak_lcq_qgrades_20260901) AS bak_qgrades;

-- ============================================================================
-- APLICAR. Solo toca lo que hoy vale 5 (grademax=5 / q.grade=5): si algo ya
-- está en 2 o tiene otro máximo, no se toca y aparecerá en la verificación.
-- El orden importa: primero las notas (aún se sabe que la escala es 5),
-- después los máximos.
-- ============================================================================

-- A1 · notas del módulo quiz: proporcional × 2/5
UPDATE mdl_quiz_grades qg
JOIN mdl_quiz q ON q.id = qg.quiz
SET qg.grade = qg.grade * 2 / 5
WHERE q.name LIKE 'Live Class Quiz%' AND q.grade = 5 AND qg.grade IS NOT NULL;

-- A2 · el máximo de la actividad
UPDATE mdl_quiz q
SET q.grade = 2
WHERE q.name LIKE 'Live Class Quiz%' AND q.grade = 5;

-- A3 · notas del libro de calificaciones: proporcional × 2/5 (raw y final)
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
SET gg.finalgrade   = gg.finalgrade * 2 / 5,
    gg.rawgrade     = CASE WHEN gg.rawgrade IS NULL THEN NULL ELSE gg.rawgrade * 2 / 5 END,
    gg.rawgrademax  = 2
WHERE gi.itemtype = 'mod' AND gi.itemmodule = 'quiz'
  AND gi.itemname LIKE 'Live Class Quiz%' AND gi.grademax = 5;

-- A4 · el ítem del libro: máximo 2, peso 0.02, y needsupdate para que Moodle
-- recalcule (aggregationcoef=1 NO se toca: sigue siendo crédito extra)
UPDATE mdl_grade_items gi
SET gi.grademax = 2, gi.aggregationcoef2 = 0.02, gi.needsupdate = 1
WHERE gi.itemtype = 'mod' AND gi.itemmodule = 'quiz'
  AND gi.itemname LIKE 'Live Class Quiz%' AND gi.grademax = 5;

-- A5 · forzar el recálculo del TOTAL de cada aula afectada
UPDATE mdl_grade_items gc
JOIN (SELECT DISTINCT courseid FROM mdl_grade_items
      WHERE itemtype = 'mod' AND itemmodule = 'quiz'
        AND itemname LIKE 'Live Class Quiz%') x ON x.courseid = gc.courseid
SET gc.needsupdate = 1
WHERE gc.itemtype = 'course';

-- ============================================================================
-- VERIFICACIÓN (pegar los tres resultados)
-- ============================================================================

-- V1 · no debe quedar ningún ítem Live Class Quiz con máximo 5
SELECT gi.grademax, COUNT(*) AS items
FROM mdl_grade_items gi
WHERE gi.itemtype = 'mod' AND gi.itemmodule = 'quiz'
  AND gi.itemname LIKE 'Live Class Quiz%'
GROUP BY gi.grademax;

-- V2 · ninguna nota del libro por encima de 2 (tolerancia de redondeo 0.01)
SELECT COUNT(*) AS notas_sobre_2
FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
WHERE gi.itemtype = 'mod' AND gi.itemmodule = 'quiz'
  AND gi.itemname LIKE 'Live Class Quiz%'
  AND gg.finalgrade > 2.01;

-- V3 · los quizzes como actividad, todos en 2
SELECT q.grade, COUNT(*) AS quizzes
FROM mdl_quiz q
WHERE q.name LIKE 'Live Class Quiz%'
GROUP BY q.grade;
