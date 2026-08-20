-- ---------------------------------------------------------------------------
-- Inventario de la NOMENCLATURA de evaluaciones del campus.
--
-- Para correr en N8N contra la base de Moodle (MySQL 5.7). No usa
-- REGEXP_REPLACE, que solo existe desde MySQL 8.
--
-- La norma declarada por la universidad son cuatro familias:
--   Quiz Session · Module Test · Final Subject Project · Live Class Quiz
--
-- Todo lo demás sale marcado FUERA DE LA NORMA, que es lo que hay que ordenar.
--
-- El nombre se normaliza quitándole el numeral del final —"Quiz Session 01" y
-- "Quiz Session 12" son la misma familia— en dos pasadas, porque hay nombres
-- con dos sufijos: "EO Module Test V 20" pierde primero el 20 y luego la V.
-- ---------------------------------------------------------------------------
SELECT
  CASE
    WHEN f2.familia REGEXP 'Quiz Session'          THEN 'Quiz Session'
    WHEN f2.familia REGEXP 'Module Test'           THEN 'Module Test'
    WHEN f2.familia REGEXP 'Final Subject Project' THEN 'Final Subject Project'
    WHEN f2.familia REGEXP 'Live Class Quiz'       THEN 'Live Class Quiz'
    ELSE 'FUERA DE LA NORMA'
  END                              AS norma,
  f2.familia                       AS nomenclatura,
  COUNT(*)                         AS items,
  COUNT(DISTINCT f2.courseid)      AS aulas,
  SUM(f2.oculto)                   AS items_ocultos,
  MIN(f2.modulo)                   AS tipo_actividad
FROM (
  -- Segunda pasada: quita un sufijo más (números romanos, letras sueltas).
  SELECT
    f1.courseid, f1.oculto, f1.modulo,
    CASE
      WHEN SUBSTRING_INDEX(f1.familia, ' ', -1) REGEXP '^[0-9IVXivx]+$'
       AND f1.familia LIKE '% %'
      THEN TRIM(SUBSTRING(f1.familia, 1,
             LENGTH(f1.familia) - LENGTH(SUBSTRING_INDEX(f1.familia, ' ', -1))))
      ELSE f1.familia
    END AS familia
  FROM (
    -- Primera pasada: quita el numeral final.
    SELECT
      gi.courseid,
      COALESCE(gi.hidden > 0, 0)                              AS oculto,
      COALESCE(gi.itemmodule, 'manual')                       AS modulo,
      CASE
        WHEN SUBSTRING_INDEX(TRIM(gi.itemname), ' ', -1) REGEXP '^[0-9IVXivx]+$'
         AND TRIM(gi.itemname) LIKE '% %'
        THEN TRIM(SUBSTRING(TRIM(gi.itemname), 1,
               LENGTH(TRIM(gi.itemname)) - LENGTH(SUBSTRING_INDEX(TRIM(gi.itemname), ' ', -1))))
        ELSE TRIM(gi.itemname)
      END AS familia
    FROM mdl_grade_items gi
    JOIN mdl_course c ON c.id = gi.courseid
    WHERE gi.itemtype IN ('mod', 'manual')   -- fuera los totales de curso y categoría
      AND gi.itemname IS NOT NULL
      AND TRIM(gi.itemname) <> ''
      AND c.id <> 1                          -- fuera el "curso" del sitio
  ) f1
) f2
GROUP BY norma, f2.familia
ORDER BY norma, items DESC;
