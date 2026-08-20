-- ---------------------------------------------------------------------------
-- Inventario de la NOMENCLATURA de evaluaciones del campus (MySQL 5.7).
--
-- Son DOS consultas. En N8N se pega UNA por nodo.
--
-- Reglas (acordadas 20/08/2026):
--   · Solo items VISIBLES (hidden = 0). Los ocultos no cuentan ni separan.
--   · Los números y números romanos se quitan EN CUALQUIER POSICIÓN del
--     nombre, no solo al final: "Test I Final Evaluation" y "Test II Final
--     Evaluation" son la misma familia, "Test Final Evaluation".
--   · "Quiz 1" y "Quiz 2" acumulan como "Quiz".
--
-- La norma declarada por la universidad son cuatro familias:
--   Quiz Session · Module Test · Final Subject Project · Live Class Quiz
--
-- Técnica (5.7 no tiene REGEXP_REPLACE):
--   · Dígitos: REPLACE anidado del 0 al 9 — un dígito nunca es parte de una
--     palabra, así que quitarlo de cualquier posición es seguro.
--   · Romanos: se quitan como PALABRA completa (' IV ' con espacios), nunca
--     como letras sueltas — si no, la I de "Final" desaparecería.
--   · Espacios dobles resultantes: colapsados con el truco '<>' / '><'.
--   · CHAR_LENGTH-free: ya no se recorta por longitud, no hay riesgo de
--     partir una tilde.
-- ---------------------------------------------------------------------------


-- ═══ CONSULTA 1 — el inventario acumulado (pegar SOLO esto en el nodo) ═════
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
    -- 3) colapsar los espacios que dejaron los números al irse, y recortar
    TRIM(REPLACE(REPLACE(REPLACE(s.sin_romanos, ' ', '<>'), '><', ''), '<>', ' ')) AS familia
  FROM (
    SELECT
      d.courseid,
      d.modulo,
      -- 2) quitar números romanos como PALABRA completa (de más largo a más corto)
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        CONCAT(' ', d.sin_digitos, ' '),
        ' XII ', ' '), ' VIII ', ' '), ' VII ', ' '), ' III ', ' '),
        ' XI ',  ' '), ' IX ',   ' '), ' VI ',  ' '), ' IV ',  ' '),
        ' II ',  ' '), ' X ',    ' '), ' V ',   ' '), ' I ',   ' ') AS sin_romanos
    FROM (
      SELECT
        gi.courseid,
        COALESCE(gi.itemmodule, 'manual') AS modulo,
        -- 1) quitar TODOS los dígitos, estén donde estén
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          TRIM(gi.itemname),
          '0',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''),'9','') AS sin_digitos
      FROM mdl_grade_items gi
      JOIN mdl_course c ON c.id = gi.courseid
      WHERE gi.itemtype IN ('mod', 'manual')   -- fuera totales de curso y categoría
        AND gi.hidden = 0                      -- SOLO visibles
        AND gi.itemname IS NOT NULL
        AND TRIM(gi.itemname) <> ''
        AND c.id <> 1                          -- fuera el "curso" del sitio
    ) d
  ) s
) f
WHERE f.familia <> ''
GROUP BY f.familia
ORDER BY norma, items_visibles DESC;


-- ═══ CONSULTA 2 — dónde está lo que se sale de la norma (otro nodo) ════════
-- Lista aula por aula las evaluaciones VISIBLES que no llevan ninguna de las
-- cuatro nomenclaturas, con el nombre tal cual está en Moodle.
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
