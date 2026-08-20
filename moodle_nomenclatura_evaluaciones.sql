-- ---------------------------------------------------------------------------
-- Inventario de la NOMENCLATURA de evaluaciones del campus (MySQL 5.7).
--
-- ⚠ N8N: el nodo MySQL corre la consulta UNA VEZ POR CADA ITEM que recibe del
--   nodo anterior, y concatena los resultados. Si el inventario sale repetido
--   —la misma fila muchas veces— activa "Execute Once" en el nodo o conéctalo
--   a una entrada de un solo item. Un GROUP BY no puede repetir claves: si las
--   ves repetidas, la consulta corrió varias veces.
--
-- Reglas (20/08/2026):
--   · Solo items VISIBLES (hidden = 0).
--   · Números y romanos fuera, EN CUALQUIER POSICIÓN: "Test I Final
--     Evaluation" = "Test II Final Evaluation" = "Test Final Evaluation".
--   · Caracteres invisibles neutralizados: espacio no separable (NBSP),
--     tabulaciones y saltos de línea cuentan como espacio normal.
--   · Puntuación que queda huérfana al irse los números (" - ", "()") se
--     retira también.
--
-- Norma declarada: Quiz Session · Module Test · Final Subject Project ·
-- Live Class Quiz. Todo lo demás sale FUERA DE LA NORMA.
-- ---------------------------------------------------------------------------


-- ═══ CONSULTA 0 — el panorama en cinco filas (verificación rápida) ═════════
-- Cuántos items visibles hay por norma en todo el campus. Si esta consulta
-- sale con más de 5 filas, el nodo está ejecutando varias veces (ver ⚠ arriba).
SELECT
  CASE
    WHEN gi.itemname REGEXP 'Quiz Session'          THEN 'Quiz Session'
    WHEN gi.itemname REGEXP 'Module Test'           THEN 'Module Test'
    WHEN gi.itemname REGEXP 'Final Subject Project' THEN 'Final Subject Project'
    WHEN gi.itemname REGEXP 'Live Class Quiz'       THEN 'Live Class Quiz'
    ELSE 'FUERA DE LA NORMA'
  END                         AS norma,
  COUNT(*)                    AS items_visibles,
  COUNT(DISTINCT gi.courseid) AS aulas
FROM mdl_grade_items gi
JOIN mdl_course c ON c.id = gi.courseid
WHERE gi.itemtype IN ('mod', 'manual')
  AND gi.hidden = 0
  AND gi.itemname IS NOT NULL
  AND TRIM(gi.itemname) <> ''
  AND c.id <> 1
GROUP BY norma
ORDER BY items_visibles DESC;


-- ═══ CONSULTA 1 — inventario por familia (pegar SOLO esto en su nodo) ══════
SELECT
  CASE
    WHEN f.familia REGEXP 'Quiz Session'          THEN 'Quiz Session'
    WHEN f.familia REGEXP 'Module Test'           THEN 'Module Test'
    WHEN f.familia REGEXP 'Final Subject Project' THEN 'Final Subject Project'
    WHEN f.familia REGEXP 'Live Class Quiz'       THEN 'Live Class Quiz'
    ELSE 'FUERA DE LA NORMA'
  END                                                        AS norma,
  f.familia                                                  AS nomenclatura,
  COUNT(*)                                                   AS items_visibles,
  COUNT(DISTINCT f.courseid)                                 AS aulas,
  GROUP_CONCAT(DISTINCT f.modulo ORDER BY f.modulo SEPARATOR ', ') AS tipos_actividad
FROM (
  SELECT
    s.courseid,
    s.modulo,
    -- 4) fuera la puntuación que quedó huérfana al irse los números, colapsar
    --    espacios (truco <>/><) y recortar restos al final del nombre
    TRIM(BOTH '-' FROM TRIM(BOTH ':' FROM TRIM(
      REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(s.sin_romanos,
          ' - ', ' '), ' – ', ' '), ' — ', ' '), '( )', ' '), '()', ' '),
      ' ', '<>'), '><', ''), '<>', ' ')
    ))) AS familia
  FROM (
    SELECT
      d.courseid,
      d.modulo,
      -- 3) romanos fuera, como PALABRA completa (de más largo a más corto);
      --    nunca como letras sueltas o la I de "Final" desaparecería
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        CONCAT(' ', d.sin_digitos, ' '),
        ' XII ', ' '), ' VIII ', ' '), ' VII ', ' '), ' III ', ' '),
        ' XI ',  ' '), ' IX ',   ' '), ' VI ',  ' '), ' IV ',  ' '),
        ' II ',  ' '), ' X ',    ' '), ' V ',   ' '), ' I ',   ' ') AS sin_romanos
    FROM (
      SELECT
        gi.courseid,
        COALESCE(gi.itemmodule, 'manual') AS modulo,
        -- 2) todos los dígitos fuera, estén donde estén
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          -- 1) invisibles a espacio normal: NBSP, tab, CR, LF
          REPLACE(REPLACE(REPLACE(REPLACE(
            CONVERT(gi.itemname USING utf8mb4),
            CHAR(0xC2A0 USING utf8mb4), ' '), '\t', ' '), '\r', ' '), '\n', ' '),
          '0',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''),'9','') AS sin_digitos
      FROM mdl_grade_items gi
      JOIN mdl_course c ON c.id = gi.courseid
      WHERE gi.itemtype IN ('mod', 'manual')
        AND gi.hidden = 0
        AND gi.itemname IS NOT NULL
        AND TRIM(gi.itemname) <> ''
        AND c.id <> 1
    ) d
  ) s
) f
WHERE f.familia <> ''
GROUP BY f.familia
ORDER BY norma, items_visibles DESC;


-- ═══ CONSULTA 2 — dónde está lo que se sale de la norma (otro nodo) ════════
SELECT
  c.id                              AS aula_id,
  c.shortname                       AS aula,
  cat.name                          AS categoria,
  gi.itemname                       AS evaluacion,
  COALESCE(gi.itemmodule, 'manual') AS tipo,
  gi.aggregationcoef                AS coeficiente,
  gi.grademax                       AS maximo
FROM mdl_grade_items gi
JOIN mdl_course c                   ON c.id = gi.courseid
LEFT JOIN mdl_course_categories cat ON cat.id = c.category
WHERE gi.itemtype IN ('mod', 'manual')
  AND gi.hidden = 0
  AND gi.itemname IS NOT NULL
  AND TRIM(gi.itemname) <> ''
  AND c.id <> 1
  AND gi.itemname NOT REGEXP 'Quiz Session|Module Test|Final Subject Project|Live Class Quiz'
ORDER BY cat.name, c.shortname, gi.sortorder;


-- ═══ CONSULTA 3 (diagnóstico, correr solo si la 1 sigue sin acumular) ══════
-- Muestra en HEX las variantes de un nombre que debería ser uno solo: la
-- diferencia de bytes dice exactamente qué carácter invisible las separa.
-- SELECT gi.itemname, HEX(gi.itemname) AS bytes, COUNT(*) AS veces
-- FROM mdl_grade_items gi
-- WHERE gi.itemname LIKE '%Final Subject Project%'
-- GROUP BY gi.itemname
-- ORDER BY veces DESC
-- LIMIT 30;
