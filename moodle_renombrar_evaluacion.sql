-- ---------------------------------------------------------------------------
-- Renombrar "Evaluación NN" y "EO - Evaluación NN" → "Quiz Session NN"
-- (solo items VISIBLES, campus auditable). MySQL 5.7 vía N8N, un paso por nodo.
--
-- Protocolo de la campaña de julio, sin excepciones:
--   respaldo verificado → ensayo en seco → luz verde → UPDATE → VERIFICACIÓN
--   pegada. Ningún UPDATE se da por cerrado sin su verificación.
--
-- Lecciones de julio que este SQL respeta:
--   · El nombre del ítem en mdl_grade_items es un ESPEJO. La fuente es
--     mdl_quiz.name: si solo se renombra el espejo, el recálculo lo revierte.
--     Se actualizan las DOS tablas, la fuente primero.
--   · Tras renombrar, PURGA DE CACHÉS obligatoria en Moodle
--     (Administración del sitio → Desarrollo → Purgar cachés).
--   · REPLACE es sensible a mayúsculas: "Autoevaluación" no se toca.
--   · El número se conserva: "EO - Evaluación 03" → "Quiz Session 03".
-- ---------------------------------------------------------------------------


-- ═══ PASO 0 — Confirmar que la credencial apunta al campus correcto ════════
-- Debe devolver "ECT 103…" y "Ciberdefensa…". Si no, DETENERSE: es otra base.
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);


-- ═══ PASO 1 — ENSAYO EN SECO: qué se va a renombrar y a qué ════════════════
-- Revisar esta lista completa antes de seguir. La columna "quedaria" muestra
-- el resultado exacto del renombre.
SELECT c.id AS aula_id, c.shortname AS aula,
       gi.itemname AS actual,
       REPLACE(REPLACE(gi.itemname, 'EO - Evaluación', 'Quiz Session'),
               'Evaluación', 'Quiz Session') AS quedaria,
       COALESCE(gi.itemmodule, 'manual') AS modulo
FROM mdl_grade_items gi
JOIN mdl_course c ON c.id = gi.courseid
WHERE gi.itemtype = 'mod' AND gi.hidden = 0
  AND LOWER(TRIM(gi.itemname)) REGEXP '^(eo[[:space:]]*-[[:space:]]*)?evaluación[[:space:]]*[0-9]*$'
  AND c.id <> 1
  AND c.shortname NOT LIKE '%Inducci%'  AND c.shortname NOT LIKE '%Induction%'
  AND c.shortname NOT LIKE '%Demo%'     AND c.shortname NOT LIKE '%Complementario%'
  AND NOT EXISTS (
    SELECT 1 FROM mdl_course_categories sub
    JOIN mdl_course_categories anc
      ON anc.id = sub.id OR sub.path LIKE CONCAT(anc.path, '/%')
    WHERE sub.id = c.category
      AND anc.name IN ('Aulas de Inducción', 'Excluidos ERP', 'Otros')
  )
ORDER BY c.shortname, gi.itemname;

-- 1b — Resumen del ensayo: cuántos por módulo. Si aparece un módulo que NO es
-- quiz (assign, workshop…), PARAR y avisar: su fuente no es mdl_quiz y este
-- paquete solo renombra fuentes quiz.
SELECT COALESCE(gi.itemmodule, 'manual') AS modulo, COUNT(*) AS items, COUNT(DISTINCT gi.courseid) AS aulas
FROM mdl_grade_items gi
JOIN mdl_course c ON c.id = gi.courseid
WHERE gi.itemtype = 'mod' AND gi.hidden = 0
  AND LOWER(TRIM(gi.itemname)) REGEXP '^(eo[[:space:]]*-[[:space:]]*)?evaluación[[:space:]]*[0-9]*$'
  AND c.id <> 1
  AND c.shortname NOT LIKE '%Inducci%'  AND c.shortname NOT LIKE '%Induction%'
  AND c.shortname NOT LIKE '%Demo%'     AND c.shortname NOT LIKE '%Complementario%'
  AND NOT EXISTS (
    SELECT 1 FROM mdl_course_categories sub
    JOIN mdl_course_categories anc
      ON anc.id = sub.id OR sub.path LIKE CONCAT(anc.path, '/%')
    WHERE sub.id = c.category
      AND anc.name IN ('Aulas de Inducción', 'Excluidos ERP', 'Otros')
  )
GROUP BY modulo;


-- ═══ PASO 2 — RESPALDOS (verificar el conteo antes de seguir) ══════════════
CREATE TABLE mdl_gi_evaluacion_bak_20260820 AS
SELECT gi.*
FROM mdl_grade_items gi
JOIN mdl_course c ON c.id = gi.courseid
WHERE gi.itemtype = 'mod' AND gi.hidden = 0
  AND LOWER(TRIM(gi.itemname)) REGEXP '^(eo[[:space:]]*-[[:space:]]*)?evaluación[[:space:]]*[0-9]*$'
  AND c.id <> 1
  AND c.shortname NOT LIKE '%Inducci%'  AND c.shortname NOT LIKE '%Induction%'
  AND c.shortname NOT LIKE '%Demo%'     AND c.shortname NOT LIKE '%Complementario%'
  AND NOT EXISTS (
    SELECT 1 FROM mdl_course_categories sub
    JOIN mdl_course_categories anc
      ON anc.id = sub.id OR sub.path LIKE CONCAT(anc.path, '/%')
    WHERE sub.id = c.category
      AND anc.name IN ('Aulas de Inducción', 'Excluidos ERP', 'Otros')
  );

CREATE TABLE mdl_quiz_evaluacion_bak_20260820 AS
SELECT q.*
FROM mdl_quiz q
WHERE LOWER(TRIM(q.name)) REGEXP '^(eo[[:space:]]*-[[:space:]]*)?evaluación[[:space:]]*[0-9]*$'
  AND q.id IN (SELECT b.iteminstance FROM mdl_gi_evaluacion_bak_20260820 b WHERE b.itemmodule = 'quiz');

-- 2b — El conteo del respaldo debe cuadrar con el ensayo. Pegar el resultado.
SELECT (SELECT COUNT(*) FROM mdl_gi_evaluacion_bak_20260820)   AS gi_respaldadas,
       (SELECT COUNT(*) FROM mdl_quiz_evaluacion_bak_20260820) AS quiz_respaldados;


-- ═══ PASO 3 — UPDATE de la FUENTE (mdl_quiz), acotado por el respaldo ══════
-- Lista explícita vía respaldo: en 5.7, subconsultar la tabla destino puede
-- dar error 1093; el respaldo ya es la lista congelada de lo aprobado.
UPDATE mdl_quiz q
JOIN mdl_gi_evaluacion_bak_20260820 b
  ON b.itemmodule = 'quiz' AND b.iteminstance = q.id
SET q.name = REPLACE(REPLACE(q.name, 'EO - Evaluación', 'Quiz Session'),
                     'Evaluación', 'Quiz Session')
WHERE LOWER(TRIM(q.name)) REGEXP '^(eo[[:space:]]*-[[:space:]]*)?evaluación[[:space:]]*[0-9]*$';


-- ═══ PASO 4 — UPDATE del ESPEJO (mdl_grade_items), mismo criterio ══════════
UPDATE mdl_grade_items gi
JOIN mdl_gi_evaluacion_bak_20260820 b ON b.id = gi.id
SET gi.itemname = REPLACE(REPLACE(gi.itemname, 'EO - Evaluación', 'Quiz Session'),
                          'Evaluación', 'Quiz Session');


-- ═══ PASO 5 — VERIFICACIÓN (pegar el resultado; debe dar 0 y 0) ════════════
SELECT
  (SELECT COUNT(*) FROM mdl_grade_items gi
    JOIN mdl_gi_evaluacion_bak_20260820 b ON b.id = gi.id
    WHERE gi.itemname LIKE '%Evaluación%')                       AS gi_sin_renombrar,
  (SELECT COUNT(*) FROM mdl_quiz q
    JOIN mdl_gi_evaluacion_bak_20260820 b
      ON b.itemmodule = 'quiz' AND b.iteminstance = q.id
    WHERE q.name LIKE '%Evaluación%')                            AS quiz_sin_renombrar;

-- 5b — Muestra de 10 para ver el resultado con los ojos.
SELECT gi.courseid, gi.itemname
FROM mdl_grade_items gi
JOIN mdl_gi_evaluacion_bak_20260820 b ON b.id = gi.id
LIMIT 10;


-- ═══ PASO 6 — EN MOODLE, A MANO ═════════════════════════════════════════════
-- Administración del sitio → Desarrollo → Purgar cachés. OBLIGATORIO: Moodle
-- cachea los nombres y seguiría mostrando los viejos.


-- ═══ DESHACER (solo si hay que revertir) ════════════════════════════════════
-- UPDATE mdl_quiz q        JOIN mdl_quiz_evaluacion_bak_20260820 b ON b.id = q.id  SET q.name = b.name;
-- UPDATE mdl_grade_items gi JOIN mdl_gi_evaluacion_bak_20260820  b ON b.id = gi.id SET gi.itemname = b.itemname;
-- Los respaldos NO se borran hasta pasada una semana:
-- DROP TABLE mdl_gi_evaluacion_bak_20260820; DROP TABLE mdl_quiz_evaluacion_bak_20260820;
