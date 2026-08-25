-- ---------------------------------------------------------------------------
-- CONVERSIÓN MASIVA A NATURAL + BONOS (Extra Credit) · FASE DE ENSAYO
-- MySQL 5.7 vía N8N, un paso por nodo. SOLO LECTURAS: no modifica nada.
--
-- Regla de conversión (piloto: aula 637, 23/08/2026):
--   · media ponderada → Natural; el PESO actual de cada ítem (aggregationcoef)
--     se convierte en su CALIFICACIÓN MÁXIMA (4.1667 → máx 4.16667, 30 → 30).
--   · ítems con coeficiente 0 (videos, podcasts, EO viejos) → máximo 0:
--     siguen sin pesar y sin inflar la escala.
--   · "Live Class Quiz" → Extra Credit con su aporte como máximo (por definir:
--     5 puntos cada una salvo que se decida otra cosa).
--   · El total del curso queda sobre 100 y cada alumno conserva su promedio
--     (más los bonos que tenga rendidos).
--
-- La fase de APLICACIÓN se entrega después de revisar este ensayo.
-- ---------------------------------------------------------------------------

-- ═══ PASO 0 · CREDENCIAL (obligatorio antes de todo) ═══
-- Debe devolver "ECT 103…" y "Ciberdefensa…". Si no, DETENER: credencial equivocada.
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);


-- ═══ PASO 1 · CENSO: aulas en media ponderada y su convertibilidad ═══
-- CONVERTIBLE = los pesos suman 100 (±0.1). "REVISAR" = pesos no suman 100:
-- esas aulas NO entran al lote hasta corregirlas.
-- aggregateonlygraded: 0 = el total es acumulado (vacías cuentan 0, igual que
-- Natural); 1 = promedia solo lo rendido — si aparece algún 1, avisar: en esas
-- aulas la conversión CAMBIA el significado del total de los alumnos a medias.
SELECT
  c.id AS aula,
  c.shortname,
  gc.aggregateonlygraded,
  SUM(CASE WHEN gi.itemtype = 'mod' AND gi.aggregationcoef > 0 THEN 1 ELSE 0 END) AS items_con_peso,
  ROUND(SUM(CASE WHEN gi.itemtype = 'mod' AND gi.aggregationcoef > 0 THEN gi.aggregationcoef ELSE 0 END), 3) AS suma_pesos,
  SUM(CASE WHEN gi.itemtype = 'mod' AND (gi.aggregationcoef = 0 OR gi.aggregationcoef IS NULL) THEN 1 ELSE 0 END) AS items_sin_peso,
  SUM(CASE WHEN gi.itemtype = 'mod' AND gi.itemname LIKE 'Live Class Quiz%' THEN 1 ELSE 0 END) AS live_class_quiz,
  CASE WHEN ABS(SUM(CASE WHEN gi.itemtype = 'mod' AND gi.aggregationcoef > 0 THEN gi.aggregationcoef ELSE 0 END) - 100) <= 0.1
       THEN 'CONVERTIBLE' ELSE 'REVISAR (pesos no suman 100)' END AS estado
FROM mdl_course c
JOIN mdl_grade_categories gc ON gc.courseid = c.id AND gc.depth = 1
JOIN mdl_course_categories cc ON cc.id = c.category
LEFT JOIN mdl_grade_items gi ON gi.courseid = c.id AND gi.itemtype = 'mod'
WHERE gc.aggregation = 10
  AND c.shortname NOT LIKE 'Inducci%' AND c.shortname NOT LIKE 'Induction%'
  AND c.shortname NOT LIKE 'Demo%' AND c.shortname NOT LIKE 'Complementario%'
  AND NOT EXISTS (
    SELECT 1 FROM mdl_course_categories a
    WHERE a.name IN ('Aulas de Inducción', 'Excluidos ERP', 'Otros')
      AND (cc.id = a.id OR cc.path LIKE CONCAT(a.path, '/%'))
  )
GROUP BY c.id, c.shortname, gc.aggregateonlygraded
ORDER BY estado, c.id;


-- ═══ PASO 2 · ENSAYO POR ALUMNO: total actual vs total en Natural ═══
-- (versión final, con pesos NORMALIZADOS: sirve también para capstones 50/50)
-- Para cada aula: el total que Moodle tiene hoy contra el total recalculado
-- con la regla "peso → máximo". La vara: max_diferencia ≤ 0.01 y
-- con_diferencia = 0. Las aulas que difieran se sacan del lote (PASO 1b del
-- archivo de aplicación) y se revisan aparte.
SELECT
  t.aula, t.shortname,
  COUNT(*) AS alumnos_comparados,
  ROUND(MAX(ABS(t.total_actual - t.total_natural)), 3) AS max_diferencia,
  SUM(CASE WHEN ABS(t.total_actual - t.total_natural) > 0.01 THEN 1 ELSE 0 END) AS con_diferencia
FROM (
  SELECT
    gic.courseid AS aula, c.shortname, ggc.userid,
    ggc.finalgrade AS total_actual,
    COALESCE((
      SELECT SUM(gg.finalgrade / gi.grademax * gi.aggregationcoef)
      FROM mdl_grade_items gi
      JOIN mdl_grade_grades gg ON gg.itemid = gi.id AND gg.userid = ggc.userid
      WHERE gi.courseid = gic.courseid AND gi.itemtype = 'mod'
        AND gi.aggregationcoef > 0 AND gi.grademax > 0
        AND gg.finalgrade IS NOT NULL
    ), 0) * 100 / (
      SELECT SUM(gi2.aggregationcoef)
      FROM mdl_grade_items gi2
      WHERE gi2.courseid = gic.courseid AND gi2.itemtype = 'mod' AND gi2.aggregationcoef > 0
    ) AS total_natural
  FROM mdl_grade_items gic
  JOIN mdl_grade_grades ggc ON ggc.itemid = gic.id AND ggc.finalgrade IS NOT NULL
  JOIN mdl_course c ON c.id = gic.courseid
  JOIN mdl_grade_categories gc ON gc.courseid = c.id AND gc.depth = 1 AND gc.aggregation = 10
  JOIN mdl_course_categories cc ON cc.id = c.category
  WHERE gic.itemtype = 'course'
    AND c.shortname NOT LIKE 'Inducci%' AND c.shortname NOT LIKE 'Induction%'
    AND c.shortname NOT LIKE 'Demo%' AND c.shortname NOT LIKE 'Complementario%'
    AND NOT EXISTS (
      SELECT 1 FROM mdl_course_categories a
      WHERE a.name IN ('Aulas de Inducción', 'Excluidos ERP', 'Otros')
        AND (cc.id = a.id OR cc.path LIKE CONCAT(a.path, '/%'))
    )
    AND EXISTS (
      SELECT 1 FROM mdl_grade_items gi3
      WHERE gi3.courseid = gic.courseid AND gi3.itemtype = 'mod' AND gi3.aggregationcoef > 0
    )
) t
GROUP BY t.aula, t.shortname
ORDER BY max_diferencia DESC;


-- ═══ PASO 3 · CENSO DE BONOS: los "Live Class Quiz" que se marcarán extra ═══
-- Cuántos hay por aula y si alguno tiene NOTAS ya puestas (los rendidos
-- empezarán a sumar puntos al convertir: eso es deseado, pero hay que saber
-- a cuántos alumnos les subirá el total y cuánto).
SELECT
  gi.courseid AS aula, c.shortname,
  gi.itemname,
  gi.grademax AS max_actual,
  gi.aggregationcoef AS peso_actual,
  (SELECT COUNT(*) FROM mdl_grade_grades gg WHERE gg.itemid = gi.id AND gg.finalgrade IS NOT NULL) AS alumnos_con_nota,
  (SELECT ROUND(AVG(gg.finalgrade / gi.grademax * 100), 1) FROM mdl_grade_grades gg WHERE gg.itemid = gi.id AND gg.finalgrade IS NOT NULL) AS rendimiento_promedio_pct
FROM mdl_grade_items gi
JOIN mdl_course c ON c.id = gi.courseid
JOIN mdl_grade_categories gc ON gc.courseid = c.id AND gc.depth = 1 AND gc.aggregation = 10
WHERE gi.itemtype = 'mod' AND gi.itemname LIKE 'Live Class Quiz%'
ORDER BY gi.courseid, gi.itemname;
