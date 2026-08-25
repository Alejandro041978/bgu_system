-- ---------------------------------------------------------------------------
-- CONVERSIÓN MASIVA A NATURAL + BONOS · FASE DE APLICACIÓN
-- MySQL 5.7 vía N8N, UN PASO POR NODO, en el orden exacto de este archivo.
--
-- NO CORRER hasta que el Nodo 7 del ensayo (comparación alumno por alumno)
-- haya dado max_diferencia ≤ 0.01 en las aulas del lote. Si alguna difiere,
-- se BORRA de bak_nb_lote en el PASO 1b antes de seguir.
--
-- Regla (piloto aula 637 + decisiones del usuario, 24/08/2026):
--   · peso actual (aggregationcoef, normalizado a 100) → calificación máxima
--   · ítems sin peso → máximo 0 (siguen sin pesar y sin inflar la escala)
--   · "Live Class Quiz%" → Extra Credit con máximo 5 (cada una aporta hasta
--     +5 puntos; 80% rendido = +4)
--   · categoría del curso → Natural (13); total del curso queda sobre 100
--
-- El deshacer está al final y depende de las tablas bak_nb_*: NO borrarlas
-- hasta validar el resultado en el ERP.
-- ---------------------------------------------------------------------------

-- ═══ PASO 0 · CREDENCIAL ═══ (debe devolver ECT 103… y Ciberdefensa…)
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);


-- ═══ PASO 1 · EL LOTE (tabla auxiliar con las 360 aulas) ═══
CREATE TABLE IF NOT EXISTS bak_nb_lote (courseid INT PRIMARY KEY);
INSERT IGNORE INTO bak_nb_lote (courseid) VALUES
(12),(87),(88),(89),(90),(91),(92),(93),(94),(95),(96),(97),(99),(100),(101),(102),(104),(105),(106),(107),(108),(109),(110),(113),(119),(120),(121),(122),(124),(126),(129),(131),(132),(134),(135),(136),(137),(138),(148),(151),(152),(153),(154),(155),(159),(172),(175),(176),(177),(179),(180),(181),(182),(183),(184),(185),(186),(188),(189),(192),(194),(195),(196),(197),(202),(205),(206),(207),(208),(209),(210),(211),(212),(213),(214),(216),(222),(225),(226),(236),(247),(254),(266),(267),(268),(270),(271),(272),(273),(277),(289),(292),(298),(299),(300),(304),(305),(307),(309),(311),(314),(316),(318),(319),(324),(325),(326),(327),(328),(330),(331),(332),(333),(334),(337),(338),(339),(340),(343),(346),(347),(348),(349),(350),(351),(352),(355),(356),(357),(359),(362),(363),(364),(366),(367),(368),(370),(371),(383),(408),(421),(424),(425),(433),(434),(435),(439),(442),(443),(444),(445),(446),(447),(448),(449),(450),(451),(452),(453),(454),(456),(457),(458),(460),(461),(462),(463),(464),(465),(466),(467),(468),(469),(470),(471),(472),(473),(474),(475),(476),(477),(478),(479),(480),(481),(482),(483),(484),(485),(486),(487),(499),(501),(503),(504),(506),(507),(508),(509),(510),(512),(513),(514),(515),(516),(517),(518),(519),(520),(521),(522),(524),(525),(527),(528),(529),(530),(531),(532),(533),(534),(538),(539),(546),(547),(548),(549),(550),(552),(553),(554),(561),(562),(563),(564),(565),(566),(567),(575),(576),(577),(578),(579),(580),(581),(582),(583),(584),(585),(586),(587),(589),(590),(591),(592),(593),(594),(595),(596),(597),(598),(599),(600),(601),(602),(603),(604),(605),(606),(607),(608),(609),(610),(611),(612),(613),(614),(615),(616),(617),(618),(619),(620),(621),(622),(623),(624),(625),(626),(627),(628),(629),(630),(631),(632),(633),(634),(635),(636),(643),(644),(645),(646),(647),(648),(656),(657),(658),(659),(660),(661),(662),(663),(665),(666),(667),(668),(669),(670),(671),(706),(707),(708),(711),(712),(721),(722),(731),(732),(733),(734),(736),(737),(738),(739),(740),(741),(743),(746),(747),(748),(749),(750),(751),(752),(753),(754),(760),(766),(767),(768),(769),(770),(771),(772),(773),(774),(795),(796),(797);

-- PASO 1b · El ensayo del 24/08/2026 marcó 2 aulas con diferencia: se sacan
-- del lote y se revisan aparte.
--   566 "Introducción al Coaching": max_diferencia 23.3 (4/4 alumnos difieren)
--   176 "MAC 201 - Macroeconomics - BSBA4": max_diferencia 0.021 (2/6)
DELETE FROM bak_nb_lote WHERE courseid IN (566, 176);


-- ═══ PASO 2 · GUARDAS (leer; si algo no cuadra, DETENER) ═══
-- 2a · Todas siguen en media ponderada y con pesos sanos (358 filas tras el
-- PASO 1b, y en_media_ponderada = ese mismo número)
SELECT COUNT(*) AS aulas_en_lote,
  SUM(CASE WHEN gc.aggregation = 10 THEN 1 ELSE 0 END) AS en_media_ponderada
FROM bak_nb_lote l
JOIN mdl_grade_categories gc ON gc.courseid = l.courseid AND gc.depth = 1;

-- 2b · Ninguna con subcategorías (la conversión asume libro plano). Debe dar 0.
SELECT COUNT(*) AS aulas_con_subcategorias FROM (
  SELECT gc.courseid FROM mdl_grade_categories gc
  JOIN bak_nb_lote l ON l.courseid = gc.courseid
  WHERE gc.depth > 1 GROUP BY gc.courseid
) x;

-- 2c · Suma de pesos por aula (todas entre 95–105, o exactamente 2 en capstones)
SELECT l.courseid, ROUND(SUM(gi.aggregationcoef), 3) AS suma
FROM bak_nb_lote l
JOIN mdl_grade_items gi ON gi.courseid = l.courseid AND gi.itemtype = 'mod' AND gi.aggregationcoef > 0
GROUP BY l.courseid
HAVING NOT (suma BETWEEN 95 AND 105 OR ROUND(suma, 3) = 2.000);
-- ↑ debe devolver 0 filas


-- ═══ PASO 3 · RESPALDOS (tablas bak_nb_*) ═══
CREATE TABLE bak_nb_grade_categories AS
  SELECT gc.* FROM mdl_grade_categories gc JOIN bak_nb_lote l ON l.courseid = gc.courseid;
CREATE TABLE bak_nb_grade_items AS
  SELECT gi.* FROM mdl_grade_items gi JOIN bak_nb_lote l ON l.courseid = gi.courseid;
CREATE TABLE bak_nb_grade_grades AS
  SELECT gg.* FROM mdl_grade_grades gg
  JOIN mdl_grade_items gi ON gi.id = gg.itemid
  JOIN bak_nb_lote l ON l.courseid = gi.courseid;
CREATE TABLE bak_nb_quiz AS
  SELECT q.* FROM mdl_quiz q JOIN bak_nb_lote l ON l.courseid = q.course;
CREATE TABLE bak_nb_quiz_grades AS
  SELECT qg.* FROM mdl_quiz_grades qg
  JOIN mdl_quiz q ON q.id = qg.quiz
  JOIN bak_nb_lote l ON l.courseid = q.course;
CREATE TABLE bak_nb_assign AS
  SELECT a.* FROM mdl_assign a JOIN bak_nb_lote l ON l.courseid = a.course;
CREATE TABLE bak_nb_assign_grades AS
  SELECT ag.* FROM mdl_assign_grades ag
  JOIN mdl_assign a ON a.id = ag.assignment
  JOIN bak_nb_lote l ON l.courseid = a.course;

-- 3v · Verificación del respaldo: los pares deben coincidir. Si no, DETENER.
SELECT 'grade_items' AS tabla,
  (SELECT COUNT(*) FROM mdl_grade_items gi JOIN bak_nb_lote l ON l.courseid = gi.courseid) AS original,
  (SELECT COUNT(*) FROM bak_nb_grade_items) AS respaldo
UNION ALL SELECT 'grade_grades',
  (SELECT COUNT(*) FROM mdl_grade_grades gg JOIN mdl_grade_items gi ON gi.id = gg.itemid JOIN bak_nb_lote l ON l.courseid = gi.courseid),
  (SELECT COUNT(*) FROM bak_nb_grade_grades)
UNION ALL SELECT 'quiz_grades',
  (SELECT COUNT(*) FROM mdl_quiz_grades qg JOIN mdl_quiz q ON q.id = qg.quiz JOIN bak_nb_lote l ON l.courseid = q.course),
  (SELECT COUNT(*) FROM bak_nb_quiz_grades)
UNION ALL SELECT 'assign_grades',
  (SELECT COUNT(*) FROM mdl_assign_grades ag JOIN mdl_assign a ON a.id = ag.assignment JOIN bak_nb_lote l ON l.courseid = a.course),
  (SELECT COUNT(*) FROM bak_nb_assign_grades);


-- ═══ PASO 4 · CONVERSIÓN (el orden importa: primero notas, luego máximos) ═══

-- 4a · Rescalar las NOTAS de los ítems ponderados a su nuevo máximo
--      (nuevo máximo = coef normalizado a 100; usa el grademax y coef ACTUALES)
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
JOIN bak_nb_lote l ON l.courseid = gi.courseid
JOIN (SELECT courseid, SUM(aggregationcoef) s
      FROM mdl_grade_items WHERE itemtype = 'mod' AND aggregationcoef > 0
      GROUP BY courseid) t ON t.courseid = gi.courseid
SET gg.finalgrade  = gg.finalgrade / gi.grademax * (gi.aggregationcoef * 100 / t.s),
    gg.rawgrademax = gi.aggregationcoef * 100 / t.s,
    gg.rawgrademin = 0
WHERE gi.itemtype = 'mod' AND gi.aggregationcoef > 0 AND gi.grademax > 0
  AND gi.itemname NOT LIKE 'Live Class Quiz%'
  AND gg.finalgrade IS NOT NULL;

-- 4b · Módulos QUIZ ponderados: nota del módulo y máximo del quiz
UPDATE mdl_quiz_grades qg
JOIN mdl_quiz q ON q.id = qg.quiz
JOIN bak_nb_lote l ON l.courseid = q.course
JOIN mdl_grade_items gi ON gi.itemmodule = 'quiz' AND gi.iteminstance = q.id AND gi.itemtype = 'mod'
JOIN (SELECT courseid, SUM(aggregationcoef) s
      FROM mdl_grade_items WHERE itemtype = 'mod' AND aggregationcoef > 0
      GROUP BY courseid) t ON t.courseid = q.course
SET qg.grade = qg.grade / q.grade * (gi.aggregationcoef * 100 / t.s)
WHERE gi.aggregationcoef > 0 AND q.grade > 0
  AND gi.itemname NOT LIKE 'Live Class Quiz%';

UPDATE mdl_quiz q
JOIN bak_nb_lote l ON l.courseid = q.course
JOIN mdl_grade_items gi ON gi.itemmodule = 'quiz' AND gi.iteminstance = q.id AND gi.itemtype = 'mod'
JOIN (SELECT courseid, SUM(aggregationcoef) s
      FROM mdl_grade_items WHERE itemtype = 'mod' AND aggregationcoef > 0
      GROUP BY courseid) t ON t.courseid = q.course
SET q.grade = gi.aggregationcoef * 100 / t.s
WHERE gi.aggregationcoef > 0
  AND gi.itemname NOT LIKE 'Live Class Quiz%';

-- 4c · Módulos ASSIGN ponderados: nota del módulo y máximo del assign
UPDATE mdl_assign_grades ag
JOIN mdl_assign a ON a.id = ag.assignment
JOIN bak_nb_lote l ON l.courseid = a.course
JOIN mdl_grade_items gi ON gi.itemmodule = 'assign' AND gi.iteminstance = a.id AND gi.itemtype = 'mod'
JOIN (SELECT courseid, SUM(aggregationcoef) s
      FROM mdl_grade_items WHERE itemtype = 'mod' AND aggregationcoef > 0
      GROUP BY courseid) t ON t.courseid = a.course
SET ag.grade = ag.grade / a.grade * (gi.aggregationcoef * 100 / t.s)
WHERE gi.aggregationcoef > 0 AND a.grade > 0 AND ag.grade >= 0
  AND gi.itemname NOT LIKE 'Live Class Quiz%';

UPDATE mdl_assign a
JOIN bak_nb_lote l ON l.courseid = a.course
JOIN mdl_grade_items gi ON gi.itemmodule = 'assign' AND gi.iteminstance = a.id AND gi.itemtype = 'mod'
JOIN (SELECT courseid, SUM(aggregationcoef) s
      FROM mdl_grade_items WHERE itemtype = 'mod' AND aggregationcoef > 0
      GROUP BY courseid) t ON t.courseid = a.course
SET a.grade = gi.aggregationcoef * 100 / t.s
WHERE gi.aggregationcoef > 0
  AND gi.itemname NOT LIKE 'Live Class Quiz%';

-- 4d · BONOS "Live Class Quiz": notas a base 5, módulo a 5
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
JOIN bak_nb_lote l ON l.courseid = gi.courseid
SET gg.finalgrade = gg.finalgrade / gi.grademax * 5, gg.rawgrademax = 5, gg.rawgrademin = 0
WHERE gi.itemtype = 'mod' AND gi.itemname LIKE 'Live Class Quiz%'
  AND gi.grademax > 0 AND gg.finalgrade IS NOT NULL;

UPDATE mdl_quiz_grades qg
JOIN mdl_quiz q ON q.id = qg.quiz
JOIN bak_nb_lote l ON l.courseid = q.course
JOIN mdl_grade_items gi ON gi.itemmodule = 'quiz' AND gi.iteminstance = q.id AND gi.itemtype = 'mod'
SET qg.grade = qg.grade / q.grade * 5
WHERE gi.itemname LIKE 'Live Class Quiz%' AND q.grade > 0;

UPDATE mdl_quiz q
JOIN bak_nb_lote l ON l.courseid = q.course
JOIN mdl_grade_items gi ON gi.itemmodule = 'quiz' AND gi.iteminstance = q.id AND gi.itemtype = 'mod'
SET q.grade = 5
WHERE gi.itemname LIKE 'Live Class Quiz%';

-- Ítems del gradebook de los bonos: máximo 5 y marca de EXTRA CREDIT
-- (en Natural, aggregationcoef = 1 es la marca de crédito extra)
UPDATE mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
SET gi.grademax = 5, gi.grademin = 0,
    gi.aggregationcoef = 1, gi.weightoverride = 0, gi.aggregationcoef2 = 0
WHERE gi.itemtype = 'mod' AND gi.itemname LIKE 'Live Class Quiz%';

-- 4e · Ítems PONDERADOS: el peso (normalizado) se vuelve el máximo.
-- OJO: grademax debe asignarse ANTES de poner aggregationcoef = 0 (MySQL
-- evalúa el SET de izquierda a derecha con los valores ya modificados).
UPDATE mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
JOIN (SELECT courseid, SUM(aggregationcoef) s
      FROM mdl_grade_items WHERE itemtype = 'mod' AND aggregationcoef > 0
      GROUP BY courseid) t ON t.courseid = gi.courseid
SET gi.grademax = gi.aggregationcoef * 100 / t.s,
    gi.grademin = 0,
    gi.aggregationcoef = 0, gi.weightoverride = 0, gi.aggregationcoef2 = 0
WHERE gi.itemtype = 'mod' AND gi.aggregationcoef > 0
  AND gi.itemname NOT LIKE 'Live Class Quiz%';

-- 4f · Ítems SIN PESO (videos, podcasts, EO viejos, copias): máximo 0.
-- Siguen sin pesar y dejan de inflar la escala. Sus notas históricas quedan
-- en el respaldo y en las tablas del módulo; el recálculo las muestra 0/0.
UPDATE mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
SET gi.grademax = 0, gi.grademin = 0,
    gi.aggregationcoef = 0, gi.weightoverride = 0, gi.aggregationcoef2 = 0
WHERE gi.itemtype = 'mod'
  AND (gi.aggregationcoef = 0 OR gi.aggregationcoef IS NULL)
  AND gi.itemname NOT LIKE 'Live Class Quiz%';

-- 4g · La categoría del curso pasa a NATURAL
UPDATE mdl_grade_categories gc
JOIN bak_nb_lote l ON l.courseid = gc.courseid
SET gc.aggregation = 13, gc.aggregateonlygraded = 0
WHERE gc.depth = 1;


-- ═══ PASO 5 · RECÁLCULO ═══
UPDATE mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
SET gi.needsupdate = 1;
-- Después: purgar cachés de Moodle (procedimiento de siempre) y dejar que el
-- cron de Moodle recalcule, o abrir el gradebook de un aula para forzarlo.


-- ═══ PASO 6 · VERIFICACIÓN (tras el recálculo) ═══
-- 6a · La escala del total volvió a 100 en todo el lote (0 filas fuera de rango)
SELECT gi.courseid, gi.grademax
FROM mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
WHERE gi.itemtype = 'course' AND (gi.grademax < 99.9 OR gi.grademax > 100.1);

-- 6b · Ningún alumno BAJÓ su total (el bono solo puede subirlo). Debe dar 0.
SELECT COUNT(*) AS alumnos_que_bajaron
FROM mdl_grade_items gic
JOIN bak_nb_lote l ON l.courseid = gic.courseid
JOIN mdl_grade_grades gg ON gg.itemid = gic.id
JOIN bak_nb_grade_grades bg ON bg.id = gg.id
WHERE gic.itemtype = 'course'
  AND gg.finalgrade IS NOT NULL AND bg.finalgrade IS NOT NULL
  AND gg.finalgrade < bg.finalgrade - 0.02;

-- 6c · Cuántos alumnos SUBIERON (los que tenían bonos rendidos) y cuánto
SELECT COUNT(*) AS alumnos_con_bono,
  ROUND(AVG(gg.finalgrade - bg.finalgrade), 2) AS subida_promedio,
  ROUND(MAX(gg.finalgrade - bg.finalgrade), 2) AS subida_maxima
FROM mdl_grade_items gic
JOIN bak_nb_lote l ON l.courseid = gic.courseid
JOIN mdl_grade_grades gg ON gg.itemid = gic.id
JOIN bak_nb_grade_grades bg ON bg.id = gg.id
WHERE gic.itemtype = 'course'
  AND gg.finalgrade IS NOT NULL AND bg.finalgrade IS NOT NULL
  AND gg.finalgrade > bg.finalgrade + 0.02;


-- ═══════════════════ DESHACER (solo si algo salió mal) ═══════════════════
-- Restaura desde bak_nb_* y fuerza recálculo. Correr en este orden.
-- UPDATE mdl_grade_categories gc JOIN bak_nb_grade_categories b ON b.id = gc.id
--   SET gc.aggregation = b.aggregation, gc.aggregateonlygraded = b.aggregateonlygraded;
-- UPDATE mdl_grade_items gi JOIN bak_nb_grade_items b ON b.id = gi.id
--   SET gi.grademax = b.grademax, gi.grademin = b.grademin,
--       gi.aggregationcoef = b.aggregationcoef, gi.weightoverride = b.weightoverride,
--       gi.aggregationcoef2 = b.aggregationcoef2, gi.needsupdate = 1;
-- UPDATE mdl_grade_grades gg JOIN bak_nb_grade_grades b ON b.id = gg.id
--   SET gg.finalgrade = b.finalgrade, gg.rawgrademax = b.rawgrademax, gg.rawgrademin = b.rawgrademin;
-- UPDATE mdl_quiz q JOIN bak_nb_quiz b ON b.id = q.id SET q.grade = b.grade;
-- UPDATE mdl_quiz_grades qg JOIN bak_nb_quiz_grades b ON b.id = qg.id SET qg.grade = b.grade;
-- UPDATE mdl_assign a JOIN bak_nb_assign b ON b.id = a.id SET a.grade = b.grade;
-- UPDATE mdl_assign_grades ag JOIN bak_nb_assign_grades b ON b.id = ag.id SET ag.grade = b.grade;
-- + purgar cachés y recalcular.
