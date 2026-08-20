-- ---------------------------------------------------------------------------
-- Inventario de la NOMENCLATURA de evaluaciones del campus (MySQL 5.7).
--
-- Son DOS consultas. En N8N se pega UNA por nodo: el nodo MySQL ejecuta una
-- sentencia por defecto, y pegarle dos SELECT seguidos falla.
--
--   · CONSULTA 1 → qué nomenclaturas existen y cuáles se salen de la norma.
--   · CONSULTA 2 → en qué aulas están las que se salen, para repartir trabajo.
--
-- La norma declarada por la universidad son cuatro familias:
--   Quiz Session · Module Test · Final Subject Project · Live Class Quiz
--
-- Notas técnicas:
--   · Sin REGEXP_REPLACE (es de MySQL 8). La normalización quita el numeral
--     final con SUBSTRING_INDEX, en dos pasadas, porque hay sufijos
--     encadenados: "EO Module Test V 20" pierde primero el 20 y luego la V.
--   · CHAR_LENGTH y no LENGTH: LENGTH cuenta BYTES y con tildes ("Evaluación
--     Final 01") recortaría el nombre a mitad de letra.
--   · Solo lectura. Si el prefijo de tablas no es mdl_, cambiarlo.
-- ---------------------------------------------------------------------------


-- ═══ CONSULTA 1 — pegar SOLO esto en el primer nodo ═══════════════════════
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
             CHAR_LENGTH(f1.familia) - CHAR_LENGTH(SUBSTRING_INDEX(f1.familia, ' ', -1))))
      ELSE f1.familia
    END AS familia
  FROM (
    -- Primera pasada: quita el numeral final.
    SELECT
      gi.courseid,
      CASE WHEN gi.hidden > 0 THEN 1 ELSE 0 END               AS oculto,
      COALESCE(gi.itemmodule, 'manual')                       AS modulo,
      CASE
        WHEN SUBSTRING_INDEX(TRIM(gi.itemname), ' ', -1) REGEXP '^[0-9IVXivx]+$'
         AND TRIM(gi.itemname) LIKE '% %'
        THEN TRIM(SUBSTRING(TRIM(gi.itemname), 1,
               CHAR_LENGTH(TRIM(gi.itemname)) - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(gi.itemname), ' ', -1))))
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


-- ═══ CONSULTA 2 — pegar SOLO esto en el segundo nodo ══════════════════════
-- En qué aulas están las evaluaciones que se salen de la norma.
SELECT
  c.id                        AS aula_id,
  c.shortname                 AS aula,
  cat.name                    AS categoria,
  gi.itemname                 AS evaluacion,
  COALESCE(gi.itemmodule, 'manual') AS tipo,
  gi.aggregationcoef          AS coeficiente,
  gi.grademax                 AS maximo,
  CASE WHEN gi.hidden > 0 THEN 'oculto' ELSE '' END AS visibilidad
FROM mdl_grade_items gi
JOIN mdl_course c            ON c.id = gi.courseid
LEFT JOIN mdl_course_categories cat ON cat.id = c.category
WHERE gi.itemtype IN ('mod', 'manual')
  AND gi.itemname IS NOT NULL
  AND TRIM(gi.itemname) <> ''
  AND c.id <> 1
  AND gi.itemname NOT REGEXP 'Quiz Session|Module Test|Final Subject Project|Live Class Quiz'
ORDER BY cat.name, c.shortname, gi.sortorder;
