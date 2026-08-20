-- ---------------------------------------------------------------------------
-- Censo de nomenclatura de evaluaciones — formato original del 20/07/2026,
-- el que funcionó en la campaña de orden del campus. MySQL 5.7, vía N8N.
--
-- Cambios respecto de julio: sin el filtro de "aulas con coef 0" (entonces
-- cazábamos aulas rotas; ahora es el campus entero) y con el pelado de
-- romanos del censo del Master (TRIM TRAILING en orden IV→III→II→I, nunca
-- REPLACE de letras sueltas, que corrompería palabras con I).
--
-- Solo VISIBLES (hidden = 0). Una consulta por nodo de N8N; si el resultado
-- sale repetido, el nodo está corriendo una vez por cada item de entrada →
-- "Execute Once".
-- ---------------------------------------------------------------------------


-- ═══ Q1 — Catálogo de tipos normalizados (todo el campus) ══════════════════
SELECT TRIM(TRAILING ' I' FROM TRIM(TRAILING ' II' FROM TRIM(TRAILING ' III' FROM TRIM(TRAILING ' IV' FROM
         TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
           TRIM(gi.itemname),'0',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''),'9',''))
       )))) AS tipo,
       COUNT(*) AS items, COUNT(DISTINCT gi.courseid) AS aulas
FROM mdl_grade_items gi
WHERE gi.itemtype = 'mod' AND gi.hidden = 0
GROUP BY tipo
ORDER BY items DESC
LIMIT 100;


-- ═══ Q2 — Firmas por aula y categoría (cada familia en un renglón) ═════════
SELECT cc.name AS categoria, s.firma, COUNT(*) AS aulas,
       SUBSTRING(GROUP_CONCAT(s.shortname SEPARATOR ' | '), 1, 120) AS ejemplos
FROM (
  SELECT t.courseid, c.shortname, c.category,
         GROUP_CONCAT(CONCAT(t.n, '× ', t.tipo) ORDER BY t.tipo SEPARATOR ' + ') AS firma
  FROM (
    SELECT gi.courseid,
           TRIM(TRAILING ' I' FROM TRIM(TRAILING ' II' FROM TRIM(TRAILING ' III' FROM TRIM(TRAILING ' IV' FROM
             TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
               TRIM(gi.itemname),'0',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''),'9',''))
           )))) AS tipo,
           COUNT(*) AS n
    FROM mdl_grade_items gi
    WHERE gi.itemtype = 'mod' AND gi.hidden = 0
    GROUP BY gi.courseid, tipo
  ) t
  JOIN mdl_course c ON c.id = t.courseid
  WHERE c.id <> 1
    AND c.shortname NOT LIKE '%Inducci%'
    AND c.shortname NOT LIKE '%Induction%'
    AND c.shortname NOT LIKE '%Demo%'
  GROUP BY t.courseid, c.shortname, c.category
) s
JOIN mdl_course_categories cc ON cc.id = s.category
GROUP BY cc.name, s.firma
ORDER BY cc.name, aulas DESC;
