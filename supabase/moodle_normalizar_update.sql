-- ===========================================================================
-- MOODLE (MySQL vía N8N) — normalizar ponderaciones de la familia
-- "Update Certificate (3 months)" (48 aulas, 16 programas × 3 módulos).
--
-- NO es para Supabase.
--
-- Estado detectado (auditoría del 30-07-2026): NINGUNA de las 48 tiene los
-- coeficientes sumando 100. Están como estaba Advanced antes de su campaña:
--   · 34 aulas con coef = 12  (12 ítems × 1 → media simple)
--   ·  3 aulas con coef = 9   (9 ítems × 1)
--   · 11 aulas con coef = 0   (SIN coeficientes; 4 de ellas con peso 0
--                              confirmado → hoy calculan mal la nota final)
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ LOS OCULTOS TAMBIÉN CUENTAN                                             │
-- │                                                                         │
-- │ Un ítem oculto con coeficiente > 0 SIGUE ocupando peso en la agregación:│
-- │ el denominador crece y los visibles valen menos de lo que dicen. Es el  │
-- │ "peso fantasma" que en julio diluyó 130 aulas al 43-62% mientras la     │
-- │ suma de los visibles marcaba 100 y todo parecía correcto.               │
-- │                                                                         │
-- │ Por eso aquí NO se filtran los ocultos: se MIDEN y se ponen en 0        │
-- │ explícitamente, para que el total de TODOS los ítems sea exactamente    │
-- │ 100. Y "oculto" son dos cosas distintas que hay que mirar juntas:       │
-- │   · el ítem del libro de calificaciones (mdl_grade_items.hidden)        │
-- │   · la actividad en la página del curso (mdl_course_modules.visible)    │
-- │ El auditor del ERP no los ve: lee con los ojos de un alumno, y a un     │
-- │ alumno los ítems ocultos no le aparecen. Esta consulta es el único      │
-- │ sitio donde se ven.                                                     │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Protocolo: 1) diagnóstico → 2) revisión de ocultos → 3) respaldo →
-- 4) dry-run → 5) ajuste → 6) verificación → 7) recálculo y cachés.
-- ===========================================================================


-- ── 0. EL UNIVERSO ─────────────────────────────────────────────────────────
SELECT cc.id AS categoria_id, cc.name AS programa, COUNT(c.id) AS aulas
  FROM mdl_course_categories cc
  JOIN mdl_course_categories padre ON padre.id = cc.parent
  LEFT JOIN mdl_course c ON c.category = cc.id
 WHERE padre.name LIKE 'Update Certificate%'
 GROUP BY cc.id, cc.name
 ORDER BY cc.name;


-- ── 1. DIAGNÓSTICO: visibles Y ocultos, por separado ───────────────────────
-- `oculto` = el ítem está oculto en el libro O su actividad está oculta en el
-- curso. Ojo con `gi.hidden`: puede ser 0, 1, o una FECHA (oculto hasta X), así
-- que la comparación correcta es <> 0, no = 1.
SELECT c.id                                                        AS aula_id,
       c.shortname,
       gc.aggregation                                              AS agregacion_actual,
       SUM(oculto = 0)                                             AS items_visibles,
       ROUND(SUM(IF(oculto = 0, gi.aggregationcoef, 0)), 5)        AS coef_visibles,
       SUM(oculto = 1)                                             AS items_ocultos,
       ROUND(SUM(IF(oculto = 1, gi.aggregationcoef, 0)), 5)        AS coef_ocultos,   -- ← el peso fantasma
       ROUND(SUM(gi.aggregationcoef), 5)                           AS coef_total,
       ROUND(100 / NULLIF(SUM(oculto = 0), 0), 5)                  AS coef_objetivo
  FROM (
    SELECT gi.*, c.id AS cid, gc.aggregation,
           IF(gi.hidden <> 0 OR COALESCE(cm.visible, 1) = 0, 1, 0) AS oculto
      FROM mdl_grade_items gi
      JOIN mdl_course c                ON c.id = gi.courseid
      JOIN mdl_course_categories cc    ON cc.id = c.category
      JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
      JOIN mdl_grade_categories gc     ON gc.courseid = c.id AND gc.depth = 1
      LEFT JOIN mdl_modules m          ON m.name = gi.itemmodule
      LEFT JOIN mdl_course_modules cm  ON cm.course = gi.courseid
                                      AND cm.module = m.id
                                      AND cm.instance = gi.iteminstance
     WHERE gi.itemtype = 'mod' AND gi.gradetype = 1
  ) gi
  JOIN mdl_course c ON c.id = gi.cid
  JOIN mdl_grade_categories gc ON gc.courseid = c.id AND gc.depth = 1
 GROUP BY c.id, c.shortname, gc.aggregation
 ORDER BY coef_ocultos DESC, items_visibles, c.id;


-- ── 2. REVISIÓN DE OCULTOS (leer antes de tocar nada) ──────────────────────
-- Los ítems ocultos QUE HOY LLEVAN PESO. Cada uno es una decisión:
--   · sobra (quedó de una edición) → su coeficiente va a 0;
--   · no debería estar oculto      → hay que mostrarlo y contarlo entre los
--                                    visibles ANTES de normalizar.
-- Si esta consulta devuelve filas, resuélvelas con el área académica primero:
-- el ajuste de más abajo los pone en 0 sin preguntar.
SELECT c.id AS aula_id, c.shortname, gi.id AS item_id, gi.itemname,
       gi.aggregationcoef AS coef_actual,
       gi.hidden          AS item_oculto,
       cm.visible         AS actividad_visible
  FROM mdl_grade_items gi
  JOIN mdl_course c                ON c.id = gi.courseid
  JOIN mdl_course_categories cc    ON cc.id = c.category
  JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
  LEFT JOIN mdl_modules m          ON m.name = gi.itemmodule
  LEFT JOIN mdl_course_modules cm  ON cm.course = gi.courseid AND cm.module = m.id AND cm.instance = gi.iteminstance
 WHERE gi.itemtype = 'mod' AND gi.gradetype = 1
   AND (gi.hidden <> 0 OR COALESCE(cm.visible, 1) = 0)
   AND gi.aggregationcoef > 0
 ORDER BY gi.aggregationcoef DESC, c.id;

-- Reparto de estructuras (solo visibles). Las que no tengan 12 requieren
-- decisión académica: forzar 9 × 11.11111 da por buena una estructura que
-- quizá esté incompleta.
SELECT items_visibles, COUNT(*) AS aulas, GROUP_CONCAT(aula_id ORDER BY aula_id) AS ids
  FROM (
    SELECT c.id AS aula_id,
           SUM(IF(gi.hidden <> 0 OR COALESCE(cm.visible, 1) = 0, 0, 1)) AS items_visibles
      FROM mdl_course c
      JOIN mdl_course_categories cc    ON cc.id = c.category
      JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
      LEFT JOIN mdl_grade_items gi     ON gi.courseid = c.id AND gi.itemtype = 'mod' AND gi.gradetype = 1
      LEFT JOIN mdl_modules m          ON m.name = gi.itemmodule
      LEFT JOIN mdl_course_modules cm  ON cm.course = gi.courseid AND cm.module = m.id AND cm.instance = gi.iteminstance
     GROUP BY c.id
  ) t
 GROUP BY items_visibles
 ORDER BY aulas DESC;


-- ── 3. RESPALDO (obligatorio) ──────────────────────────────────────────────
CREATE TABLE mdl_grade_items_bak_update_20260730 AS
  SELECT gi.* FROM mdl_grade_items gi
   WHERE gi.courseid IN (
     SELECT c.id FROM mdl_course c
       JOIN mdl_course_categories cc    ON cc.id = c.category
       JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
   );

CREATE TABLE mdl_grade_categories_bak_update_20260730 AS
  SELECT gc.* FROM mdl_grade_categories gc
   WHERE gc.courseid IN (
     SELECT c.id FROM mdl_course c
       JOIN mdl_course_categories cc    ON cc.id = c.category
       JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
   );


-- ── 4. DRY-RUN ─────────────────────────────────────────────────────────────
-- Ítem por ítem, lo que va a pasar. Los ocultos aparecen con coef_nuevo = 0.
SELECT gi.courseid AS aula_id, c.shortname, gi.id AS item_id, gi.itemname,
       IF(gi.hidden <> 0 OR COALESCE(cm.visible, 1) = 0, 'OCULTO', 'visible') AS estado,
       gi.aggregationcoef AS coef_actual,
       IF(gi.hidden <> 0 OR COALESCE(cm.visible, 1) = 0, 0, ROUND(100 / t.visibles, 5)) AS coef_nuevo
  FROM mdl_grade_items gi
  JOIN mdl_course c ON c.id = gi.courseid
  LEFT JOIN mdl_modules m         ON m.name = gi.itemmodule
  LEFT JOIN mdl_course_modules cm ON cm.course = gi.courseid AND cm.module = m.id AND cm.instance = gi.iteminstance
  JOIN (
    SELECT gi2.courseid,
           SUM(IF(gi2.hidden <> 0 OR COALESCE(cm2.visible, 1) = 0, 0, 1)) AS visibles
      FROM mdl_grade_items gi2
      JOIN mdl_course c2                ON c2.id = gi2.courseid
      JOIN mdl_course_categories cc     ON cc.id = c2.category
      JOIN mdl_course_categories padre  ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
      LEFT JOIN mdl_modules m2          ON m2.name = gi2.itemmodule
      LEFT JOIN mdl_course_modules cm2  ON cm2.course = gi2.courseid AND cm2.module = m2.id AND cm2.instance = gi2.iteminstance
     WHERE gi2.itemtype = 'mod' AND gi2.gradetype = 1
     GROUP BY gi2.courseid
  ) t ON t.courseid = gi.courseid
 WHERE gi.itemtype = 'mod' AND gi.gradetype = 1
   -- Descomenta para normalizar SOLO las de estructura estándar:
   -- AND t.visibles = 12
 ORDER BY gi.courseid, estado DESC, gi.id;


-- ── 5. AJUSTE ──────────────────────────────────────────────────────────────
-- 5a. La categoría raíz agrega por MEDIA PONDERADA (10), que es el método que
--     usa `aggregationcoef`. Sin esto, cambiar los coeficientes no hace nada.
UPDATE mdl_grade_categories gc
  JOIN mdl_course c                ON c.id = gc.courseid
  JOIN mdl_course_categories cc    ON cc.id = c.category
  JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
   SET gc.aggregation = 10, gc.timemodified = UNIX_TIMESTAMP()
 WHERE gc.depth = 1 AND gc.aggregation <> 10;

-- 5b. Visibles → 100 / nº de visibles.  Ocultos → 0.
--     Las dos cosas en la MISMA sentencia: si solo se normalizaran los
--     visibles, los ocultos seguirían robando peso y el total pasaría de 100.
UPDATE mdl_grade_items gi
  LEFT JOIN mdl_modules m         ON m.name = gi.itemmodule
  LEFT JOIN mdl_course_modules cm ON cm.course = gi.courseid AND cm.module = m.id AND cm.instance = gi.iteminstance
  JOIN (
    SELECT gi2.courseid,
           SUM(IF(gi2.hidden <> 0 OR COALESCE(cm2.visible, 1) = 0, 0, 1)) AS visibles
      FROM mdl_grade_items gi2
      JOIN mdl_course c2                ON c2.id = gi2.courseid
      JOIN mdl_course_categories cc     ON cc.id = c2.category
      JOIN mdl_course_categories padre  ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
      LEFT JOIN mdl_modules m2          ON m2.name = gi2.itemmodule
      LEFT JOIN mdl_course_modules cm2  ON cm2.course = gi2.courseid AND cm2.module = m2.id AND cm2.instance = gi2.iteminstance
     WHERE gi2.itemtype = 'mod' AND gi2.gradetype = 1
     GROUP BY gi2.courseid
  ) t ON t.courseid = gi.courseid
   SET gi.aggregationcoef = IF(gi.hidden <> 0 OR COALESCE(cm.visible, 1) = 0, 0, ROUND(100 / t.visibles, 5)),
       gi.timemodified    = UNIX_TIMESTAMP()
 WHERE gi.itemtype = 'mod' AND gi.gradetype = 1
   -- Mismo filtro que hayas usado en el dry-run:
   -- AND t.visibles = 12
;

-- 5c. El total del curso, sobre 100.
UPDATE mdl_grade_items gi
  JOIN mdl_course c                ON c.id = gi.courseid
  JOIN mdl_course_categories cc    ON cc.id = c.category
  JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
   SET gi.grademax = 100, gi.grademin = 0, gi.timemodified = UNIX_TIMESTAMP()
 WHERE gi.itemtype = 'course' AND (gi.grademax <> 100 OR gi.grademin <> 0);


-- ── 6. VERIFICACIÓN ────────────────────────────────────────────────────────
-- Suma sobre TODOS los ítems (visibles + ocultos). Debe devolver 0 filas.
-- Comprobar solo los visibles es lo que dejó pasar el peso fantasma.
SELECT c.id AS aula_id, c.shortname,
       ROUND(SUM(gi.aggregationcoef), 5) AS coef_total,
       ROUND(SUM(IF(gi.hidden <> 0 OR COALESCE(cm.visible, 1) = 0, gi.aggregationcoef, 0)), 5) AS coef_ocultos
  FROM mdl_grade_items gi
  JOIN mdl_course c                ON c.id = gi.courseid
  JOIN mdl_course_categories cc    ON cc.id = c.category
  JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
  LEFT JOIN mdl_modules m          ON m.name = gi.itemmodule
  LEFT JOIN mdl_course_modules cm  ON cm.course = gi.courseid AND cm.module = m.id AND cm.instance = gi.iteminstance
 WHERE gi.itemtype = 'mod' AND gi.gradetype = 1
 GROUP BY c.id, c.shortname
HAVING ABS(SUM(gi.aggregationcoef) - 100) > 0.01
    OR SUM(IF(gi.hidden <> 0 OR COALESCE(cm.visible, 1) = 0, gi.aggregationcoef, 0)) > 0;


-- ── 7. RECÁLCULO Y CACHÉS ──────────────────────────────────────────────────
UPDATE mdl_grade_items gi
  JOIN mdl_course c                ON c.id = gi.courseid
  JOIN mdl_course_categories cc    ON cc.id = c.category
  JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
   SET gi.needsupdate = 1;
-- Después, en Moodle: Administración del sitio → Desarrollo → Purgar cachés.
-- Y en el ERP: Auditor del Campus → Auditar. Update debe quedar en
-- suma_coeficientes = 100 como Advanced.


-- ── Reversa ────────────────────────────────────────────────────────────────
-- UPDATE mdl_grade_items gi JOIN mdl_grade_items_bak_update_20260730 b ON b.id = gi.id
--    SET gi.aggregationcoef = b.aggregationcoef, gi.grademax = b.grademax,
--        gi.grademin = b.grademin, gi.needsupdate = 1;
-- UPDATE mdl_grade_categories gc JOIN mdl_grade_categories_bak_update_20260730 b ON b.id = gc.id
--    SET gc.aggregation = b.aggregation;
