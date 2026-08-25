-- ---------------------------------------------------------------------------
-- SUMA DE PONDERACIONES POR AULA · versión consciente del método (25/08/2026)
--
-- Reemplaza el SELECT del workflow de N8N "sincronización de coeficientes"
-- (el que postea a /api/sync/moodle-coefs). La consulta vieja sumaba
-- aggregationcoef a secas; con la conversión a agregación NATURAL eso ya no
-- significa nada: el peso vive en el MÁXIMO del ítem y el coeficiente pasó a
-- ser la marca de extra credit (1 = bono).
--
-- Regla nueva, por aula según su método:
--   · Natural (13):        suma de grademax de ítems mod VISIBLES no-extra
--                          (aggregationcoef = 0). Los bonos (coef = 1) no
--                          entran: suman por encima, no dentro del 100.
--   · Media ponderada (10) y el resto: suma de aggregationcoef de ítems mod
--                          visibles — la métrica de siempre.
--
-- En ambos casos el objetivo sano es 100 (±0.5), que es lo que verifican el
-- auditor y el cierre de actas en el ERP. Mismo formato de salida de siempre:
-- [{ aula_id, suma_coeficientes }].
-- ---------------------------------------------------------------------------

-- PASO 0 · CREDENCIAL: debe devolver "ECT 103…" y "Ciberdefensa…"; si no, DETENER.
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);

-- CONSULTA (reemplaza a la del nodo actual)
SELECT
  gc.courseid AS aula_id,
  ROUND(CASE WHEN gc.aggregation = 13 THEN
    COALESCE(SUM(CASE WHEN gi.itemtype = 'mod' AND gi.hidden = 0
                       AND (gi.aggregationcoef = 0 OR gi.aggregationcoef IS NULL)
                      THEN gi.grademax ELSE 0 END), 0)
  ELSE
    COALESCE(SUM(CASE WHEN gi.itemtype = 'mod' AND gi.hidden = 0
                      THEN gi.aggregationcoef ELSE 0 END), 0)
  END, 5) AS suma_coeficientes
FROM mdl_grade_categories gc
LEFT JOIN mdl_grade_items gi ON gi.courseid = gc.courseid
WHERE gc.depth = 1
GROUP BY gc.courseid, gc.aggregation;
