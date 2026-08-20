-- ---------------------------------------------------------------------------
-- Censo de nomenclatura de evaluaciones — formato original del 20/07/2026,
-- el que funcionó en la campaña de orden del campus. MySQL 5.7, vía N8N.
--
-- Excluye las MISMAS categorías que el Auditor del Campus (tabla
-- moodle_audit_exclusions del ERP, foto del 20/08/2026):
--     Aulas de Inducción · Excluidos ERP · Otros          (56 aulas)
-- La exclusión es por ANCESTRO real en el árbol de categorías —la categoría
-- y todo lo que cuelgue de ella—, igual que la regla del auditor. Si algún
-- día se declara una exclusión nueva en el ERP, hay que añadirla al IN (...)
-- de las dos consultas.
--
-- Solo VISIBLES (hidden = 0). Una consulta por nodo de N8N.
-- ---------------------------------------------------------------------------


-- ═══ Q1 — Catálogo de tipos normalizados (campus auditable) ════════════════
SELECT TRIM(TRAILING ' I' FROM TRIM(TRAILING ' II' FROM TRIM(TRAILING ' III' FROM TRIM(TRAILING ' IV' FROM
         TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
           TRIM(gi.itemname),'0',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''),'9',''))
       )))) AS tipo,
       COUNT(*) AS items, COUNT(DISTINCT gi.courseid) AS aulas
FROM mdl_grade_items gi
JOIN mdl_course c ON c.id = gi.courseid
WHERE gi.itemtype = 'mod' AND gi.hidden = 0
  AND c.id <> 1
  -- fuera los examenes complementarios: son aulas de servicio (COMP), no
  -- asignaturas, y sus evaluaciones llevan nombres propios fuera de patron
  AND c.shortname NOT LIKE '%Complementario%'
  -- fuera las categorías excluidas del auditor, con todo su subárbol
  AND NOT EXISTS (
    SELECT 1
    FROM mdl_course_categories sub
    JOIN mdl_course_categories anc
      ON anc.id = sub.id OR sub.path LIKE CONCAT(anc.path, '/%')
    WHERE sub.id = c.category
      AND anc.name IN ('Aulas de Inducción', 'Excluidos ERP', 'Otros')
  )
GROUP BY tipo
ORDER BY items DESC
LIMIT 100;


-- ═══ Q2 — Firmas del campus: una fila por firma ════════════════════════════
-- Agrupa por la FIRMA sola, sin partir por categoría: dos aulas con la misma
-- estructura acumulan en el mismo renglón vivan donde vivan. Menos filas —
-- firma · cuántas aulas la comparten · ejemplos de sus nombres.
SELECT s.firma,
       COUNT(*) AS aulas,
       SUBSTRING(GROUP_CONCAT(s.shortname ORDER BY s.shortname SEPARATOR ' | '), 1, 300) AS ejemplos
FROM (
  SELECT t.courseid, c.shortname,
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
    AND c.shortname NOT LIKE '%Complementario%'
    -- fuera las categorías excluidas del auditor, con todo su subárbol
    AND NOT EXISTS (
      SELECT 1
      FROM mdl_course_categories sub
      JOIN mdl_course_categories anc
        ON anc.id = sub.id OR sub.path LIKE CONCAT(anc.path, '/%')
      WHERE sub.id = c.category
        AND anc.name IN ('Aulas de Inducción', 'Excluidos ERP', 'Otros')
    )
  GROUP BY t.courseid, c.shortname
) s
GROUP BY s.firma
ORDER BY aulas DESC;
