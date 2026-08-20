-- ---------------------------------------------------------------------------
-- Renombres de la familia "EO" + convergencia de exámenes a la norma "Exam"
-- (solo items VISIBLES, campus auditable). MySQL 5.7 vía N8N, un paso por nodo.
--
--   EO - Quiz Session        → Quiz Session
--   EO - Module Test         → Module Test
--   EO Module Test           → Module Test
--   EO - Trabajo Final       → Final Subject Project      (fuente: mdl_assign)
--   EO Trabajo Final         → Final Subject Project      (fuente: mdl_assign)
--   EO - Examen Final        → Final Exam
--   EO - Examen Intermedio   → Midterm Exam
--   Mindterm Test (typo jul.)→ Midterm Exam               (Master EN, 33 aulas)
--   Midterm Test             → Midterm Exam
--   Final Test               → Final Exam                  (Master EN)
--
-- Decreto 20/08/2026: los exámenes terminan en "Exam" (Final Exam, Midterm
-- Exam), la norma que ya se aplicó al Bachelor en julio. "Module Test" NO se
-- toca: es una de las cuatro familias decretadas y no es un examen.
--
-- El número se conserva: "EO Module Test 03" → "Module Test 03".
--
-- Lecciones de julio que este SQL respeta:
--   · La fuente del nombre depende del MÓDULO: quiz → mdl_quiz.name;
--     assign → mdl_assign.name. El espejo (mdl_grade_items.itemname) se
--     actualiza al final; si solo se toca el espejo, el recálculo lo revierte.
--   · REPLACE es sensible a mayúsculas: van las variantes Final/final e
--     Intermedio/intermedio vistas en julio.
--   · Tras renombrar, PURGA DE CACHÉS obligatoria.
--   · Los "Trabajo Final (envío)/(evaluación)" son módulo WORKSHOP: si el
--     ensayo 1b los muestra, quedan fuera — pendientes desde julio.
-- ---------------------------------------------------------------------------


-- ═══ PASO 0 — Confirmar credencial (debe dar "ECT 103…" y "Ciberdefensa…") ═
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);


-- ═══ PASO 1 — ENSAYO EN SECO ════════════════════════════════════════════════
-- La columna "quedaria" es el resultado exacto. Si en alguna fila
-- quedaria = actual, esa variante no tiene regla: pegarla y se añade.
SELECT c.id AS aula_id, c.shortname AS aula,
       gi.itemname AS actual,
       REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
         gi.itemname,
         'EO - Quiz Session',      'Quiz Session'),
         'EO Quiz Session',        'Quiz Session'),
         'EO - Module Test',       'Module Test'),
         'EO Module Test',         'Module Test'),
         'EO - Trabajo Final',     'Final Subject Project'),
         'EO Trabajo Final',       'Final Subject Project'),
         'EO - Examen Final',      'Final Exam'),
         'EO - Examen final',      'Final Exam'),
         'EO - Examen Intermedio', 'Midterm Exam'),
         'EO - Examen intermedio', 'Midterm Exam'),
         'Mindterm Test',          'Midterm Exam'),
         'Midterm Test',           'Midterm Exam'),
         'Final Test',             'Final Exam') AS quedaria,
       COALESCE(gi.itemmodule, 'manual') AS modulo
FROM mdl_grade_items gi
JOIN mdl_course c ON c.id = gi.courseid
WHERE gi.itemtype = 'mod' AND gi.hidden = 0
  AND (
    LOWER(TRIM(gi.itemname)) REGEXP '^eo[[:space:]]*-?[[:space:]]*(quiz session|module test|trabajo final|examen (final|intermedio))'
    OR LOWER(TRIM(gi.itemname)) REGEXP '^(mindterm|midterm|final) test'
  )
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

-- 1b — Por módulo. quiz y assign están cubiertos; si sale workshop u otro,
-- esas filas NO se renombran con este paquete (avisar).
SELECT COALESCE(gi.itemmodule, 'manual') AS modulo, COUNT(*) AS items, COUNT(DISTINCT gi.courseid) AS aulas
FROM mdl_grade_items gi
JOIN mdl_course c ON c.id = gi.courseid
WHERE gi.itemtype = 'mod' AND gi.hidden = 0
  AND (
    LOWER(TRIM(gi.itemname)) REGEXP '^eo[[:space:]]*-?[[:space:]]*(quiz session|module test|trabajo final|examen (final|intermedio))'
    OR LOWER(TRIM(gi.itemname)) REGEXP '^(mindterm|midterm|final) test'
  )
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


-- ═══ PASO 2 — RESPALDOS ═════════════════════════════════════════════════════
CREATE TABLE mdl_gi_eo_bak_20260820 AS
SELECT gi.*
FROM mdl_grade_items gi
JOIN mdl_course c ON c.id = gi.courseid
WHERE gi.itemtype = 'mod' AND gi.hidden = 0
  AND gi.itemmodule IN ('quiz', 'assign')
  AND (
    LOWER(TRIM(gi.itemname)) REGEXP '^eo[[:space:]]*-?[[:space:]]*(quiz session|module test|trabajo final|examen (final|intermedio))'
    OR LOWER(TRIM(gi.itemname)) REGEXP '^(mindterm|midterm|final) test'
  )
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

CREATE TABLE mdl_quiz_eo_bak_20260820 AS
SELECT q.* FROM mdl_quiz q
WHERE q.id IN (SELECT b.iteminstance FROM mdl_gi_eo_bak_20260820 b WHERE b.itemmodule = 'quiz');

CREATE TABLE mdl_assign_eo_bak_20260820 AS
SELECT a.* FROM mdl_assign a
WHERE a.id IN (SELECT b.iteminstance FROM mdl_gi_eo_bak_20260820 b WHERE b.itemmodule = 'assign');

-- 2b — Conteos: gi debe cuadrar con quiz + assign del ensayo 1b. Pegar.
SELECT (SELECT COUNT(*) FROM mdl_gi_eo_bak_20260820)     AS gi_respaldadas,
       (SELECT COUNT(*) FROM mdl_quiz_eo_bak_20260820)   AS quiz_respaldados,
       (SELECT COUNT(*) FROM mdl_assign_eo_bak_20260820) AS assign_respaldados;


-- ═══ PASO 3 — UPDATE fuente QUIZ ════════════════════════════════════════════
UPDATE mdl_quiz q
JOIN mdl_gi_eo_bak_20260820 b ON b.itemmodule = 'quiz' AND b.iteminstance = q.id
SET q.name = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      q.name,
      'EO - Quiz Session',      'Quiz Session'),
      'EO Quiz Session',        'Quiz Session'),
      'EO - Module Test',       'Module Test'),
      'EO Module Test',         'Module Test'),
      'EO - Examen Final',      'Final Exam'),
      'EO - Examen final',      'Final Exam'),
      'EO - Examen Intermedio', 'Midterm Exam'),
      'EO - Examen intermedio', 'Midterm Exam'),
      'Mindterm Test',          'Midterm Exam'),
      'Midterm Test',           'Midterm Exam'),
      'Final Test',             'Final Exam');


-- ═══ PASO 4 — UPDATE fuente ASSIGN (los Trabajo Final) ══════════════════════
UPDATE mdl_assign a
JOIN mdl_gi_eo_bak_20260820 b ON b.itemmodule = 'assign' AND b.iteminstance = a.id
SET a.name = REPLACE(REPLACE(
      a.name,
      'EO - Trabajo Final', 'Final Subject Project'),
      'EO Trabajo Final',   'Final Subject Project');


-- ═══ PASO 5 — UPDATE del ESPEJO (mdl_grade_items) ═══════════════════════════
UPDATE mdl_grade_items gi
JOIN mdl_gi_eo_bak_20260820 b ON b.id = gi.id
SET gi.itemname = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      gi.itemname,
      'EO - Quiz Session',      'Quiz Session'),
      'EO Quiz Session',        'Quiz Session'),
      'EO - Module Test',       'Module Test'),
      'EO Module Test',         'Module Test'),
      'EO - Trabajo Final',     'Final Subject Project'),
      'EO Trabajo Final',       'Final Subject Project'),
      'EO - Examen Final',      'Final Exam'),
      'EO - Examen final',      'Final Exam'),
      'EO - Examen Intermedio', 'Midterm Exam'),
      'EO - Examen intermedio', 'Midterm Exam'),
      'Mindterm Test',          'Midterm Exam'),
      'Midterm Test',           'Midterm Exam'),
      'Final Test',             'Final Exam');


-- ═══ PASO 6 — VERIFICACIÓN (debe dar 0 en las cuatro; pegar el resultado) ═══
SELECT
  (SELECT COUNT(*) FROM mdl_grade_items gi
    JOIN mdl_gi_eo_bak_20260820 b ON b.id = gi.id
    WHERE gi.itemname LIKE 'EO%')                                   AS gi_con_eo,
  (SELECT COUNT(*) FROM mdl_grade_items gi
    JOIN mdl_gi_eo_bak_20260820 b ON b.id = gi.id
    WHERE gi.itemname LIKE '%Mindterm%'
       OR gi.itemname LIKE '%Midterm Test%'
       OR gi.itemname LIKE '%Final Test%')                          AS gi_con_test,
  (SELECT COUNT(*) FROM mdl_quiz q
    JOIN mdl_gi_eo_bak_20260820 b ON b.itemmodule = 'quiz' AND b.iteminstance = q.id
    WHERE q.name LIKE 'EO%' OR q.name LIKE '%Mindterm%'
       OR q.name LIKE '%Midterm Test%' OR q.name LIKE '%Final Test%') AS quiz_pendientes,
  (SELECT COUNT(*) FROM mdl_assign a
    JOIN mdl_gi_eo_bak_20260820 b ON b.itemmodule = 'assign' AND b.iteminstance = a.id
    WHERE a.name LIKE 'EO%')                                        AS assign_pendientes;

-- 6b — Muestra para verlo con los ojos.
SELECT gi.courseid, gi.itemname, gi.itemmodule
FROM mdl_grade_items gi
JOIN mdl_gi_eo_bak_20260820 b ON b.id = gi.id
LIMIT 15;


-- ═══ PASO 7 — EN MOODLE, A MANO ═════════════════════════════════════════════
-- Administración del sitio → Desarrollo → Purgar cachés. OBLIGATORIO.


-- ═══ DESHACER (solo si hay que revertir) ════════════════════════════════════
-- UPDATE mdl_quiz q         JOIN mdl_quiz_eo_bak_20260820 b   ON b.id = q.id  SET q.name = b.name;
-- UPDATE mdl_assign a       JOIN mdl_assign_eo_bak_20260820 b ON b.id = a.id  SET a.name = b.name;
-- UPDATE mdl_grade_items gi JOIN mdl_gi_eo_bak_20260820 b     ON b.id = gi.id SET gi.itemname = b.itemname;
-- Respaldos: no borrar hasta pasada una semana.
-- DROP TABLE mdl_gi_eo_bak_20260820; DROP TABLE mdl_quiz_eo_bak_20260820; DROP TABLE mdl_assign_eo_bak_20260820;
