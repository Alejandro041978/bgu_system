-- ============================================================================
-- AULA 345 (MBA 604): de MEDIA PONDERADA a NATURAL (decisión del usuario 02-09)
-- Objetivo: mismos totales base (los coeficientes ya suman 100) y los
-- Live Class Quiz pasan a crédito extra de 2 pts, como en las otras 171 aulas.
-- MySQL 5.7 · un statement por nodo N8N · prefijo mdl_
-- ORDEN: censo (0-2) → respaldo (R1-R5) → aplicar (A1-A12) → verificar (V1-V4)
-- Pegar los resultados de cada etapa antes de la siguiente.
--
-- Mapa del aula (categoría 115, aggregation 10):
--   · 12 Quiz Session      coef 4.16670  → grademax 4.16670
--   ·  4 Module Test       coef 5        → grademax 5
--   ·  1 Final Subject Proj coef 30      → grademax 30      (módulo assign)
--   ·  5 Live Class Quiz   coef 0 /100   → grademax 2, coef 1 (EXTRA)
--     (hay DOS ítems "Live Class Quiz 04" — ambos se convierten)
--   · resto (quizzes 2024, EO trabajos, videos) coef 0 → hoy no cuentan y
--     seguirán sin contar: grademax 0 y nota en 0 (el respaldo y el historial
--     conservan los valores; hoy tampoco aportan nada al total).
--   · ítem 1099 ("Quiz Session 04" LEGADO, coef 4.16, hidden=1): Moodle lo
--     excluye por oculto — se trata como EXCLUIDO, no como ponderado
--     (verificado 02-09: los 17 visibles suman 100.0004 y la aritmética de
--     los totales del PASO 1 divide entre 100, no entre 104.16).
-- ============================================================================

-- PASO 0 · credenciales (debe devolver "ECT 103…" y "Ciberdefensa…")
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);

-- PASO 1 · foto de totales actuales por estudiante (el patrón de comparación)
SELECT u.idnumber, ROUND(gg.finalgrade, 2) AS total_actual
FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid AND gi.itemtype = 'course' AND gi.courseid = 345
JOIN mdl_user u ON u.id = gg.userid
WHERE gg.finalgrade IS NOT NULL
ORDER BY u.idnumber;

-- PASO 2 · inventario de ítems por grupo (debe cuadrar con el mapa de arriba)
SELECT
  CASE WHEN gi.itemname LIKE 'Live Class Quiz%' THEN 'LCQ'
       WHEN gi.aggregationcoef > 0 THEN 'ponderado'
       ELSE 'excluido' END AS grupo,
  COUNT(*) AS items, SUM(CASE WHEN gi.aggregationcoef > 0 THEN gi.aggregationcoef ELSE 0 END) AS suma_coefs
FROM mdl_grade_items gi
WHERE gi.courseid = 345 AND gi.itemtype = 'mod'
GROUP BY 1;

-- ============================================================================
-- RESPALDO
-- ============================================================================

-- R1
CREATE TABLE mdl_zz_bak_a345_items_20260902 AS
SELECT * FROM mdl_grade_items WHERE courseid = 345;

-- R2
CREATE TABLE mdl_zz_bak_a345_gg_20260902 AS
SELECT gg.* FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid WHERE gi.courseid = 345;

-- R3
CREATE TABLE mdl_zz_bak_a345_quiz_20260902 AS
SELECT * FROM mdl_quiz WHERE course = 345;

-- R4
CREATE TABLE mdl_zz_bak_a345_qg_20260902 AS
SELECT qg.* FROM mdl_quiz_grades qg JOIN mdl_quiz q ON q.id = qg.quiz WHERE q.course = 345;

-- R5 (assign del Final Subject Project + categorías)
CREATE TABLE mdl_zz_bak_a345_asg_20260902 AS
SELECT ag.* FROM mdl_assign_grades ag JOIN mdl_assign a ON a.id = ag.assignment WHERE a.course = 345;

CREATE TABLE mdl_zz_bak_a345_cats_20260902 AS
SELECT * FROM mdl_grade_categories WHERE courseid = 345;

-- Confirmación del respaldo:
SELECT
  (SELECT COUNT(*) FROM mdl_zz_bak_a345_items_20260902) AS bak_items,
  (SELECT COUNT(*) FROM mdl_zz_bak_a345_gg_20260902)    AS bak_gg,
  (SELECT COUNT(*) FROM mdl_zz_bak_a345_quiz_20260902)  AS bak_quiz,
  (SELECT COUNT(*) FROM mdl_zz_bak_a345_qg_20260902)    AS bak_qg,
  (SELECT COUNT(*) FROM mdl_zz_bak_a345_asg_20260902)   AS bak_asg,
  (SELECT COUNT(*) FROM mdl_zz_bak_a345_cats_20260902)  AS bak_cats;

-- ============================================================================
-- APLICAR (en este orden exacto)
-- ============================================================================

-- A1 · notas del módulo quiz de los ítems PONDERADOS: /100 → /coef
UPDATE mdl_quiz_grades qg
JOIN mdl_quiz q ON q.id = qg.quiz AND q.course = 345
JOIN mdl_grade_items gi ON gi.iteminstance = q.id AND gi.itemmodule = 'quiz' AND gi.itemtype = 'mod' AND gi.courseid = 345
SET qg.grade = qg.grade * gi.aggregationcoef / 100
WHERE gi.aggregationcoef > 0 AND gi.hidden = 0 AND qg.grade IS NOT NULL;

-- A2 · máximo de esos quizzes como actividad
UPDATE mdl_quiz q
JOIN mdl_grade_items gi ON gi.iteminstance = q.id AND gi.itemmodule = 'quiz' AND gi.itemtype = 'mod' AND gi.courseid = 345
SET q.grade = gi.aggregationcoef
WHERE q.course = 345 AND gi.aggregationcoef > 0 AND gi.hidden = 0;

-- A3 · notas del módulo quiz de los LIVE CLASS QUIZ: /100 → /2
UPDATE mdl_quiz_grades qg
JOIN mdl_quiz q ON q.id = qg.quiz AND q.course = 345
SET qg.grade = qg.grade * 2 / 100
WHERE q.name LIKE 'Live Class Quiz%' AND qg.grade IS NOT NULL;

-- A4 · máximo de los LCQ como actividad
UPDATE mdl_quiz q SET q.grade = 2 WHERE q.course = 345 AND q.name LIKE 'Live Class Quiz%';

-- A5 · notas del assign (Final Subject Project): /100 → /30
UPDATE mdl_assign_grades ag
JOIN mdl_assign a ON a.id = ag.assignment AND a.course = 345
SET ag.grade = ag.grade * 30 / 100
WHERE ag.grade IS NOT NULL AND ag.grade >= 0;

UPDATE mdl_assign a SET a.grade = 30 WHERE a.course = 345 AND a.grade = 100;

-- A6 · libro de calificaciones, ítems PONDERADOS: /100 → /coef
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid AND gi.courseid = 345 AND gi.itemtype = 'mod'
SET gg.finalgrade  = gg.finalgrade * gi.aggregationcoef / 100,
    gg.rawgrade    = CASE WHEN gg.rawgrade IS NULL THEN NULL ELSE gg.rawgrade * gi.aggregationcoef / 100 END,
    gg.rawgrademax = gi.aggregationcoef
WHERE gi.aggregationcoef > 0 AND gi.hidden = 0 AND gg.finalgrade IS NOT NULL;

-- A7 · libro, LIVE CLASS QUIZ: /100 → /2
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid AND gi.courseid = 345 AND gi.itemtype = 'mod'
SET gg.finalgrade  = gg.finalgrade * 2 / 100,
    gg.rawgrade    = CASE WHEN gg.rawgrade IS NULL THEN NULL ELSE gg.rawgrade * 2 / 100 END,
    gg.rawgrademax = 2
WHERE gi.itemname LIKE 'Live Class Quiz%' AND gg.finalgrade IS NOT NULL;

-- A8 · libro, ítems EXCLUIDOS (coef 0, no LCQ): a cero — en Natural un valor
-- suelto con máximo 0 se sumaría; hoy tampoco cuentan, así que el total no
-- cambia. Los valores originales quedan en el respaldo y en el historial.
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid AND gi.courseid = 345 AND gi.itemtype = 'mod'
SET gg.finalgrade = 0, gg.rawgrade = CASE WHEN gg.rawgrade IS NULL THEN NULL ELSE 0 END
WHERE (gi.aggregationcoef = 0 OR gi.hidden = 1)
  AND gi.itemname NOT LIKE 'Live Class Quiz%' AND gg.finalgrade IS NOT NULL;

-- A9 · ítems PONDERADOS del libro: grademax = coef, y el coef vuelve a 0
-- (en Natural, coef≠0 significa crédito extra — no lo son)
UPDATE mdl_grade_items gi
SET gi.grademax = gi.aggregationcoef, gi.aggregationcoef = 0, gi.needsupdate = 1
WHERE gi.courseid = 345 AND gi.itemtype = 'mod' AND gi.aggregationcoef > 0 AND gi.hidden = 0;

-- A10 · ítems LCQ: máximo 2, coef 1 (EXTRA en Natural)
UPDATE mdl_grade_items gi
SET gi.grademax = 2, gi.aggregationcoef = 1, gi.aggregationcoef2 = 0.02, gi.needsupdate = 1
WHERE gi.courseid = 345 AND gi.itemtype = 'mod' AND gi.itemname LIKE 'Live Class Quiz%';

-- A11 · ítems EXCLUIDOS: máximo 0 y coeficiente 0 (fuera del total; el 1099
-- oculto entra aquí por hidden=1 — su coef 4.16 debe morir para que en
-- Natural no cuente como crédito extra)
UPDATE mdl_grade_items gi
SET gi.grademax = 0, gi.aggregationcoef = 0, gi.needsupdate = 1
WHERE gi.courseid = 345 AND gi.itemtype = 'mod'
  AND (gi.aggregationcoef = 0 OR gi.hidden = 1)
  AND gi.itemname NOT LIKE 'Live Class Quiz%' AND gi.grademax <> 0;

-- A12 · la categoría pasa a NATURAL y el total del aula a recalcular
UPDATE mdl_grade_categories SET aggregation = 13 WHERE courseid = 345;

UPDATE mdl_grade_items SET needsupdate = 1 WHERE courseid = 345 AND itemtype = 'course';

-- ============================================================================
-- VERIFICACIÓN (correr DESPUÉS de que el cron de Moodle recalcule — unos
-- minutos tras abrir el libro de calificaciones del aula, o en la siguiente
-- corrida del cron de Moodle)
-- ============================================================================

-- V1 · inventario nuevo: LCQ máximo 2 coef 1; ponderados grademax 4.1667/5/30
-- con coef 0; excluidos grademax 0
SELECT gi.grademax, gi.aggregationcoef, COUNT(*) AS items
FROM mdl_grade_items gi
WHERE gi.courseid = 345 AND gi.itemtype = 'mod'
GROUP BY gi.grademax, gi.aggregationcoef ORDER BY gi.grademax;

-- V2 · la categoría en Natural
SELECT id, aggregation FROM mdl_grade_categories WHERE courseid = 345;

-- V3 · totales nuevos vs la foto del PASO 1 (respaldada): la base debe ser
-- idéntica ±0.05 y la diferencia positiva es EXACTAMENTE el bono LCQ ganado
SELECT u.idnumber,
  ROUND(b.finalgrade, 2)  AS total_antes,
  ROUND(gg.finalgrade, 2) AS total_ahora,
  ROUND(gg.finalgrade - b.finalgrade, 2) AS diferencia
FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid AND gi.itemtype = 'course' AND gi.courseid = 345
JOIN mdl_user u ON u.id = gg.userid
JOIN mdl_zz_bak_a345_gg_20260902 b ON b.itemid = gg.itemid AND b.userid = gg.userid
WHERE gg.finalgrade IS NOT NULL
ORDER BY diferencia DESC;

-- V4 · el bono por estudiante (para cruzar con V3): suma de sus LCQ sobre 2
SELECT u.idnumber, ROUND(SUM(gg.finalgrade), 2) AS bono_lcq
FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid AND gi.courseid = 345
  AND gi.itemtype = 'mod' AND gi.itemname LIKE 'Live Class Quiz%'
JOIN mdl_user u ON u.id = gg.userid
WHERE gg.finalgrade IS NOT NULL
GROUP BY u.idnumber ORDER BY bono_lcq DESC;
