-- ---------------------------------------------------------------------------
-- CIERRE DEL AULA PILOTO 637 (25/08/2026) · MySQL 5.7 vía N8N, un paso por nodo
--
-- El 637 se convirtió a mano a Natural en el piloto pero quedó a medias: los
-- máximos de las actividades siguen en 100 y la suma da 1800. Este paquete lo
-- deja con el diseño definido: Quiz Session = 4.16667, Module Test = 5,
-- evaluación final = 30, Live Class Quiz = extra credit de 5.
--
-- ⚠ NO correr los PASOS 2+ hasta pegarme el resultado del PASO 1: el aula se
-- manipuló por interfaz durante el piloto y hay que confirmar los nombres y
-- cuántos ítems hay de cada grupo (la suma 1800 sugiere 18 ítems en 100, uno
-- más de los 17 del diseño — hay que ver cuál sobra).
-- ---------------------------------------------------------------------------

-- ═══ PASO 0 · CREDENCIAL: debe devolver "ECT 103…" y "Ciberdefensa…" ═══
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);


-- ═══ PASO 1 · INVENTARIO (pegar el resultado antes de seguir) ═══
SELECT gi.id, gi.itemname, gi.itemmodule, gi.grademax,
       gi.aggregationcoef, gi.aggregationcoef2, gi.weightoverride,
       (SELECT COUNT(*) FROM mdl_grade_grades gg
        WHERE gg.itemid = gi.id AND gg.finalgrade IS NOT NULL) AS con_nota
FROM mdl_grade_items gi
WHERE gi.courseid = 637 AND gi.itemtype = 'mod'
ORDER BY gi.sortorder;


-- ═══ PASO 2 · RESPALDO PROPIO (el 637 no está en bak_nb_*) ═══
CREATE TABLE bak_637_grade_items AS
  SELECT * FROM mdl_grade_items WHERE courseid = 637;
CREATE TABLE bak_637_grade_grades AS
  SELECT gg.* FROM mdl_grade_grades gg
  JOIN mdl_grade_items gi ON gi.id = gg.itemid WHERE gi.courseid = 637;
CREATE TABLE bak_637_quiz AS
  SELECT * FROM mdl_quiz WHERE course = 637;
CREATE TABLE bak_637_quiz_grades AS
  SELECT qg.* FROM mdl_quiz_grades qg
  JOIN mdl_quiz q ON q.id = qg.quiz WHERE q.course = 637;
CREATE TABLE bak_637_assign AS
  SELECT * FROM mdl_assign WHERE course = 637;
CREATE TABLE bak_637_assign_grades AS
  SELECT ag.* FROM mdl_assign_grades ag
  JOIN mdl_assign a ON a.id = ag.assignment WHERE a.course = 637;

-- Verificación del respaldo (los pares deben coincidir)
SELECT 'items' tabla,
  (SELECT COUNT(*) FROM mdl_grade_items WHERE courseid = 637) original,
  (SELECT COUNT(*) FROM bak_637_grade_items) respaldo
UNION ALL SELECT 'grades',
  (SELECT COUNT(*) FROM mdl_grade_grades gg JOIN mdl_grade_items gi ON gi.id = gg.itemid WHERE gi.courseid = 637),
  (SELECT COUNT(*) FROM bak_637_grade_grades)
UNION ALL SELECT 'quiz_grades',
  (SELECT COUNT(*) FROM mdl_quiz_grades qg JOIN mdl_quiz q ON q.id = qg.quiz WHERE q.course = 637),
  (SELECT COUNT(*) FROM bak_637_quiz_grades)
UNION ALL SELECT 'assign_grades',
  (SELECT COUNT(*) FROM mdl_assign_grades ag JOIN mdl_assign a ON a.id = ag.assignment WHERE a.course = 637),
  (SELECT COUNT(*) FROM bak_637_assign_grades);


-- ═══ PASO 3 · CONVERSIÓN POR GRUPOS (un nodo por sentencia, en este orden) ═══
-- Objetivos: Quiz Session → 4.16667 · Module Test → 5 · final (assign) → 30 ·
-- Live Class Quiz → 5 como EXTRA. Cada grupo: primero las notas del libro,
-- luego las del módulo, luego el máximo del módulo, y el ítem AL FINAL.

-- 3a · Notas del libro: Quiz Session
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
SET gg.finalgrade = gg.finalgrade / gi.grademax * 4.16667, gg.rawgrademax = 4.16667, gg.rawgrademin = 0
WHERE gi.courseid = 637 AND gi.itemtype = 'mod' AND gi.itemname LIKE 'Quiz Session%'
  AND gi.grademax > 0 AND gg.finalgrade IS NOT NULL;

-- 3b · Notas del libro: Module Test
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
SET gg.finalgrade = gg.finalgrade / gi.grademax * 5, gg.rawgrademax = 5, gg.rawgrademin = 0
WHERE gi.courseid = 637 AND gi.itemtype = 'mod' AND gi.itemname LIKE 'Module Test%'
  AND gi.grademax > 0 AND gg.finalgrade IS NOT NULL;

-- 3c · Notas del libro: evaluación final (assign)
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
SET gg.finalgrade = gg.finalgrade / gi.grademax * 30, gg.rawgrademax = 30, gg.rawgrademin = 0
WHERE gi.courseid = 637 AND gi.itemtype = 'mod' AND gi.itemmodule = 'assign'
  AND gi.grademax > 0 AND gg.finalgrade IS NOT NULL;

-- 3d · Notas del libro: Live Class Quiz (a base 5)
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
SET gg.finalgrade = gg.finalgrade / gi.grademax * 5, gg.rawgrademax = 5, gg.rawgrademin = 0
WHERE gi.courseid = 637 AND gi.itemtype = 'mod' AND gi.itemname LIKE 'Live Class Quiz%'
  AND gi.grademax > 0 AND gg.finalgrade IS NOT NULL;

-- 3e · Módulos QUIZ: notas y máximos por grupo
UPDATE mdl_quiz_grades qg
JOIN mdl_quiz q ON q.id = qg.quiz
JOIN mdl_grade_items gi ON gi.itemmodule = 'quiz' AND gi.iteminstance = q.id AND gi.itemtype = 'mod'
SET qg.grade = qg.grade / q.grade *
  (CASE WHEN gi.itemname LIKE 'Quiz Session%' THEN 4.16667 ELSE 5 END)
WHERE q.course = 637 AND q.grade > 0
  AND (gi.itemname LIKE 'Quiz Session%' OR gi.itemname LIKE 'Module Test%' OR gi.itemname LIKE 'Live Class Quiz%');

UPDATE mdl_quiz q
JOIN mdl_grade_items gi ON gi.itemmodule = 'quiz' AND gi.iteminstance = q.id AND gi.itemtype = 'mod'
SET q.grade = (CASE WHEN gi.itemname LIKE 'Quiz Session%' THEN 4.16667 ELSE 5 END)
WHERE q.course = 637
  AND (gi.itemname LIKE 'Quiz Session%' OR gi.itemname LIKE 'Module Test%' OR gi.itemname LIKE 'Live Class Quiz%');

-- 3f · Módulo ASSIGN (evaluación final): notas y máximo
UPDATE mdl_assign_grades ag
JOIN mdl_assign a ON a.id = ag.assignment
SET ag.grade = ag.grade / a.grade * 30
WHERE a.course = 637 AND a.grade > 0 AND ag.grade >= 0;

UPDATE mdl_assign a
SET a.grade = 30
WHERE a.course = 637;

-- 3g · Ítems del libro: máximos por grupo y limpieza de pesos/overrides
UPDATE mdl_grade_items gi
SET gi.grademax = 4.16667, gi.grademin = 0,
    gi.aggregationcoef = 0, gi.aggregationcoef2 = 0, gi.weightoverride = 0
WHERE gi.courseid = 637 AND gi.itemtype = 'mod' AND gi.itemname LIKE 'Quiz Session%';

UPDATE mdl_grade_items gi
SET gi.grademax = 5, gi.grademin = 0,
    gi.aggregationcoef = 0, gi.aggregationcoef2 = 0, gi.weightoverride = 0
WHERE gi.courseid = 637 AND gi.itemtype = 'mod' AND gi.itemname LIKE 'Module Test%';

UPDATE mdl_grade_items gi
SET gi.grademax = 30, gi.grademin = 0,
    gi.aggregationcoef = 0, gi.aggregationcoef2 = 0, gi.weightoverride = 0
WHERE gi.courseid = 637 AND gi.itemtype = 'mod' AND gi.itemmodule = 'assign';

-- Live Class Quiz: EXTRA CREDIT (coef = 1 en Natural) con máximo 5
UPDATE mdl_grade_items gi
SET gi.grademax = 5, gi.grademin = 0,
    gi.aggregationcoef = 1, gi.aggregationcoef2 = 0, gi.weightoverride = 0
WHERE gi.courseid = 637 AND gi.itemtype = 'mod' AND gi.itemname LIKE 'Live Class Quiz%';

-- 3h · Todo lo demás del aula (videos, podcasts, el ítem sobrante del PASO 1):
-- máximo 0 — no pesa y no infla la escala.
UPDATE mdl_grade_items gi
SET gi.grademax = 0, gi.grademin = 0,
    gi.aggregationcoef = 0, gi.aggregationcoef2 = 0, gi.weightoverride = 0
WHERE gi.courseid = 637 AND gi.itemtype = 'mod'
  AND gi.itemname NOT LIKE 'Quiz Session%'
  AND gi.itemname NOT LIKE 'Module Test%'
  AND gi.itemname NOT LIKE 'Live Class Quiz%'
  AND gi.itemmodule <> 'assign';


-- ═══ PASO 4 · VERIFICAR Y RECALCULAR ═══
-- 4a · La suma de máximos no-extra debe dar 100 exacto (12×4.16667 + 4×5 + 30
-- = 100.00004) y los bonos 4 ítems de 5. Ajustar expectativa con el PASO 1.
SELECT
  ROUND(SUM(CASE WHEN gi.aggregationcoef = 0 THEN gi.grademax ELSE 0 END), 3) AS suma_no_extra,
  SUM(CASE WHEN gi.aggregationcoef = 1 THEN 1 ELSE 0 END) AS bonos,
  SUM(CASE WHEN gi.grademax = 0 THEN 1 ELSE 0 END) AS anulados
FROM mdl_grade_items gi
WHERE gi.courseid = 637 AND gi.itemtype = 'mod';

-- 4b · Ninguna nota por encima de su máximo (debe dar 0)
SELECT COUNT(*) AS notas_sobre_el_maximo
FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
WHERE gi.courseid = 637 AND gi.itemtype = 'mod' AND gi.grademax > 0
  AND gg.finalgrade IS NOT NULL AND gg.finalgrade > gi.grademax + 0.01;

-- 4c · Marcar recálculo (después: abrir el libro del aula o dejar que el
-- importador la visite)
UPDATE mdl_grade_items SET needsupdate = 1 WHERE courseid = 637;
