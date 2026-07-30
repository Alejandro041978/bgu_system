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
-- Objetivo: mismo patrón que Advanced — media ponderada con los coeficientes
-- de los ítems evaluados sumando 100 (12 → 8.33333 · 9 → 11.11111 · 10 → 10).
--
-- Protocolo: 1) diagnóstico → 2) respaldo → 3) dry-run → 4) ajuste →
-- 5) verificación → 6) recálculo y cachés.
-- ===========================================================================


-- ── 0. EL UNIVERSO ─────────────────────────────────────────────────────────
-- Las aulas de la familia, resueltas por la categoría padre. Compara el
-- conteo con las 48 que conoce el auditor antes de seguir.
--   (Si el nombre de la categoría cambió, ajústalo aquí y en el resto.)
SELECT cc.id AS categoria_id, cc.name AS programa, COUNT(c.id) AS aulas
  FROM mdl_course_categories cc
  JOIN mdl_course_categories padre ON padre.id = cc.parent
  LEFT JOIN mdl_course c ON c.category = cc.id
 WHERE padre.name LIKE 'Update Certificate%'
 GROUP BY cc.id, cc.name
 ORDER BY cc.name;


-- ── 1. DIAGNÓSTICO ─────────────────────────────────────────────────────────
-- Por aula: método de agregación actual, cuántos ítems evaluables tiene y
-- cuánto suman hoy sus coeficientes.
--
-- Ítem evaluable = actividad ('mod'), con nota numérica (gradetype = 1) y
-- VISIBLE. Los ocultos se excluyen a propósito: son la causa del peso
-- fantasma que diluyó las notas al ~50% en la campaña anterior.
SELECT c.id                                        AS aula_id,
       c.shortname,
       gc.aggregation                              AS agregacion_actual,
       COUNT(gi.id)                                AS items_evaluables,
       ROUND(SUM(gi.aggregationcoef), 5)           AS suma_coef_actual,
       ROUND(100 / NULLIF(COUNT(gi.id), 0), 5)     AS coef_objetivo
  FROM mdl_course c
  JOIN mdl_course_categories cc    ON cc.id = c.category
  JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
  JOIN mdl_grade_categories gc     ON gc.courseid = c.id AND gc.depth = 1     -- categoría raíz del curso
  LEFT JOIN mdl_grade_items gi     ON gi.courseid = c.id
                                  AND gi.itemtype = 'mod'
                                  AND gi.gradetype = 1
                                  AND gi.hidden = 0
 GROUP BY c.id, c.shortname, gc.aggregation
 ORDER BY items_evaluables, c.id;

-- Reparto de estructuras: cuántas aulas tienen 12, 9, 10… ítems.
-- Las que NO tengan 12 requieren decisión académica antes de normalizarlas:
-- forzar 9 × 11.11111 da por buena una estructura que quizá esté incompleta.
SELECT items_evaluables, COUNT(*) AS aulas, GROUP_CONCAT(aula_id ORDER BY aula_id) AS ids
  FROM (
    SELECT c.id AS aula_id, COUNT(gi.id) AS items_evaluables
      FROM mdl_course c
      JOIN mdl_course_categories cc    ON cc.id = c.category
      JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
      LEFT JOIN mdl_grade_items gi ON gi.courseid = c.id AND gi.itemtype = 'mod'
                                  AND gi.gradetype = 1 AND gi.hidden = 0
     GROUP BY c.id
  ) t
 GROUP BY items_evaluables
 ORDER BY aulas DESC;


-- ── 2. RESPALDO (obligatorio) ──────────────────────────────────────────────
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
-- Verificar: SELECT COUNT(*) FROM mdl_grade_items_bak_update_20260730;


-- ── 3. DRY-RUN ─────────────────────────────────────────────────────────────
-- Exactamente lo que va a cambiar, ítem por ítem, SIN escribir nada.
-- Revisa que `coef_nuevo` × `items` = 100 en cada aula.
SELECT gi.courseid                       AS aula_id,
       c.shortname,
       gi.id                             AS item_id,
       gi.itemname,
       gi.aggregationcoef                AS coef_actual,
       ROUND(100 / t.items, 5)           AS coef_nuevo
  FROM mdl_grade_items gi
  JOIN mdl_course c ON c.id = gi.courseid
  JOIN (
    SELECT gi2.courseid, COUNT(*) AS items
      FROM mdl_grade_items gi2
      JOIN mdl_course c2                ON c2.id = gi2.courseid
      JOIN mdl_course_categories cc     ON cc.id = c2.category
      JOIN mdl_course_categories padre  ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
     WHERE gi2.itemtype = 'mod' AND gi2.gradetype = 1 AND gi2.hidden = 0
     GROUP BY gi2.courseid
  ) t ON t.courseid = gi.courseid
 WHERE gi.itemtype = 'mod' AND gi.gradetype = 1 AND gi.hidden = 0
   -- Descomenta para normalizar SOLO las de estructura estándar:
   -- AND t.items = 12
 ORDER BY gi.courseid, gi.id;


-- ── 4. AJUSTE ──────────────────────────────────────────────────────────────
-- 4a. La categoría raíz agrega por MEDIA PONDERADA (10), que es el método que
--     usa `aggregationcoef`. Sin esto, cambiar los coeficientes no altera nada.
UPDATE mdl_grade_categories gc
  JOIN mdl_course c                ON c.id = gc.courseid
  JOIN mdl_course_categories cc    ON cc.id = c.category
  JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
   SET gc.aggregation = 10, gc.timemodified = UNIX_TIMESTAMP()
 WHERE gc.depth = 1 AND gc.aggregation <> 10;

-- 4b. Coeficiente por ítem = 100 / nº de ítems evaluables del aula.
UPDATE mdl_grade_items gi
  JOIN (
    SELECT gi2.courseid, COUNT(*) AS items
      FROM mdl_grade_items gi2
      JOIN mdl_course c2                ON c2.id = gi2.courseid
      JOIN mdl_course_categories cc     ON cc.id = c2.category
      JOIN mdl_course_categories padre  ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
     WHERE gi2.itemtype = 'mod' AND gi2.gradetype = 1 AND gi2.hidden = 0
     GROUP BY gi2.courseid
  ) t ON t.courseid = gi.courseid
   SET gi.aggregationcoef = ROUND(100 / t.items, 5),
       gi.timemodified    = UNIX_TIMESTAMP()
 WHERE gi.itemtype = 'mod' AND gi.gradetype = 1 AND gi.hidden = 0
   -- Mismo filtro que hayas usado en el dry-run:
   -- AND t.items = 12
;

-- 4c. El total del curso, sobre 100.
UPDATE mdl_grade_items gi
  JOIN mdl_course c                ON c.id = gi.courseid
  JOIN mdl_course_categories cc    ON cc.id = c.category
  JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
   SET gi.grademax = 100, gi.grademin = 0, gi.timemodified = UNIX_TIMESTAMP()
 WHERE gi.itemtype = 'course' AND (gi.grademax <> 100 OR gi.grademin <> 0);


-- ── 5. VERIFICACIÓN ────────────────────────────────────────────────────────
-- Debe devolver 0 filas: toda aula normalizada suma 100 (±0.01).
SELECT c.id AS aula_id, c.shortname, ROUND(SUM(gi.aggregationcoef), 5) AS suma
  FROM mdl_course c
  JOIN mdl_course_categories cc    ON cc.id = c.category
  JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
  JOIN mdl_grade_items gi ON gi.courseid = c.id AND gi.itemtype = 'mod'
                         AND gi.gradetype = 1 AND gi.hidden = 0
 GROUP BY c.id, c.shortname
HAVING ABS(SUM(gi.aggregationcoef) - 100) > 0.01;


-- ── 6. RECÁLCULO Y CACHÉS ──────────────────────────────────────────────────
-- Las notas ya calculadas NO se rehacen solas: hay que marcarlas.
UPDATE mdl_grade_items gi
  JOIN mdl_course c                ON c.id = gi.courseid
  JOIN mdl_course_categories cc    ON cc.id = c.category
  JOIN mdl_course_categories padre ON padre.id = cc.parent AND padre.name LIKE 'Update Certificate%'
   SET gi.needsupdate = 1;
-- Y después, en Moodle:
--   Administración del sitio → Desarrollo → Purgar todas las cachés
-- El recálculo ocurre al abrir el libro de calificaciones de cada aula.
-- Comprobación final en el ERP: Auditor del Campus → Auditar; la familia
-- Update debe pasar a `suma_coeficientes = 100` como Advanced.


-- ── Reversa ────────────────────────────────────────────────────────────────
-- UPDATE mdl_grade_items gi JOIN mdl_grade_items_bak_update_20260730 b ON b.id = gi.id
--    SET gi.aggregationcoef = b.aggregationcoef, gi.grademax = b.grademax,
--        gi.grademin = b.grademin, gi.needsupdate = 1;
-- UPDATE mdl_grade_categories gc JOIN mdl_grade_categories_bak_update_20260730 b ON b.id = gc.id
--    SET gc.aggregation = b.aggregation;
