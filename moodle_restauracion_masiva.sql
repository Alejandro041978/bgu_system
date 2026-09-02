-- ============================================================================
-- RESTAURACIÓN MASIVA de desmatriculados por carrusel (autorizada 02-09-2026)
-- Plantilla del piloto Espinoza/637: matrícula SUSPENDIDA + calificaciones
-- desde la última foto del historial (action=3), REESCALADAS a la escala
-- actual de cada ítem (los LCQ /5 entran ×2/5 solos, por aritmética).
-- MySQL 5.7 · un statement por nodo N8N · prefijo mdl_
-- ORDEN: censo (P0-P3) → aplicar (A1-A4) → verificar (V1-V3)
-- Pegar los resultados de cada etapa antes de la siguiente.
--
-- Solo INSERTS con guarda NOT EXISTS: no se pisa nada existente. El deshacer
-- es borrar lo insertado, y su alcance exacto queda certificado en la tabla
-- de trabajo mdl_zz_restaurar_20260902 (los pares que NO tenían nada).
-- ============================================================================

-- P0 · credenciales (debe devolver "ECT 103…" y "Ciberdefensa…")
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);

-- P1 · materializar los pares a restaurar: estudiantes del ERP (idnumber con
-- forma de uuid) con calificaciones BORRADAS en un aula (action=3 en el
-- historial), sin ninguna fila viva y sin ninguna matrícula en esa aula.
CREATE TABLE mdl_zz_restaurar_20260902 AS
SELECT gi.courseid AS aula, h.userid,
  COUNT(CASE WHEN gi.itemtype = 'mod' AND h.finalgrade IS NOT NULL THEN 1 END) AS items_con_nota,
  MAX(CASE WHEN gi.itemtype = 'course' THEN h.finalgrade END) AS total_borrado,
  FROM_UNIXTIME(MAX(h.timemodified)) AS fecha_borrado
FROM mdl_grade_grades_history h
JOIN (SELECT itemid, userid, MAX(id) AS ultimo FROM mdl_grade_grades_history GROUP BY itemid, userid) u
  ON u.ultimo = h.id
JOIN mdl_grade_items gi ON gi.id = h.itemid
JOIN mdl_user mu ON mu.id = h.userid AND mu.deleted = 0
  AND mu.idnumber LIKE '________-____-____-____-____________'
WHERE h.action = 3
  AND NOT EXISTS (SELECT 1 FROM mdl_grade_grades gg
                  WHERE gg.itemid = h.itemid AND gg.userid = h.userid)
  AND NOT EXISTS (SELECT 1 FROM mdl_user_enrolments ue
                  JOIN mdl_enrol e ON e.id = ue.enrolid
                  WHERE e.courseid = gi.courseid AND ue.userid = h.userid)
GROUP BY gi.courseid, h.userid
HAVING items_con_nota > 0;

-- P2 · dimensión del barrido
SELECT COUNT(*) AS pares, COUNT(DISTINCT userid) AS estudiantes,
  COUNT(DISTINCT aula) AS aulas, SUM(items_con_nota) AS calificaciones_a_restaurar,
  MIN(fecha_borrado) AS borrado_mas_viejo, MAX(fecha_borrado) AS borrado_mas_reciente
FROM mdl_zz_restaurar_20260902;

-- P3 · muestra (los 15 borrados más recientes)
SELECT r.aula, c.shortname, r.userid, r.items_con_nota,
  ROUND(r.total_borrado, 2) AS total_borrado, r.fecha_borrado
FROM mdl_zz_restaurar_20260902 r
JOIN mdl_course c ON c.id = r.aula
ORDER BY r.fecha_borrado DESC LIMIT 15;

-- ============================================================================
-- APLICAR (tras mi visto bueno sobre P2/P3)
-- ============================================================================

-- A1 · matrículas SUSPENDIDAS (solo aulas con método manual; guarda anti-dup)
INSERT INTO mdl_user_enrolments (status, enrolid, userid, timestart, timeend, modifierid, timecreated, timemodified)
SELECT 1, e.id, r.userid, 0, 0, 2, UNIX_TIMESTAMP(), UNIX_TIMESTAMP()
FROM mdl_zz_restaurar_20260902 r
JOIN mdl_enrol e ON e.courseid = r.aula AND e.enrol = 'manual'
WHERE NOT EXISTS (SELECT 1 FROM mdl_user_enrolments ue
                  WHERE ue.enrolid = e.id AND ue.userid = r.userid);

-- A2 · rol de estudiante en el contexto de cada aula
INSERT INTO mdl_role_assignments (roleid, contextid, userid, timemodified, modifierid, component, itemid, sortorder)
SELECT 5, ctx.id, r.userid, UNIX_TIMESTAMP(), 2, '', 0, 0
FROM mdl_zz_restaurar_20260902 r
JOIN mdl_context ctx ON ctx.contextlevel = 50 AND ctx.instanceid = r.aula
WHERE NOT EXISTS (SELECT 1 FROM mdl_role_assignments ra
                  WHERE ra.roleid = 5 AND ra.contextid = ctx.id AND ra.userid = r.userid);

-- A3 · calificaciones desde la última foto del historial, reescaladas a la
-- escala ACTUAL de cada ítem (grademax de hoy / máximo de la foto)
INSERT INTO mdl_grade_grades
  (itemid, userid, rawgrade, rawgrademax, rawgrademin, rawscaleid, usermodified,
   finalgrade, hidden, locked, locktime, exported, overridden, excluded,
   feedback, feedbackformat, information, informationformat,
   timecreated, timemodified, aggregationstatus, aggregationweight)
SELECT h.itemid, h.userid,
  CASE WHEN h.rawgrade IS NULL THEN NULL ELSE h.rawgrade * gi.grademax / h.rawgrademax END,
  gi.grademax, h.rawgrademin, h.rawscaleid, h.usermodified,
  h.finalgrade * gi.grademax / h.rawgrademax,
  h.hidden, h.locked, h.locktime, h.exported, h.overridden, h.excluded,
  h.feedback, h.feedbackformat, h.information, h.informationformat,
  h.timemodified, UNIX_TIMESTAMP(), 'unknown', NULL
FROM mdl_zz_restaurar_20260902 r
JOIN mdl_grade_items gi ON gi.courseid = r.aula AND gi.itemtype = 'mod' AND gi.grademax > 0
JOIN mdl_grade_grades_history h ON h.itemid = gi.id AND h.userid = r.userid
JOIN (SELECT itemid, userid, MAX(id) AS ultimo FROM mdl_grade_grades_history GROUP BY itemid, userid) u
  ON u.ultimo = h.id
WHERE h.finalgrade IS NOT NULL AND h.rawgrademax > 0
  AND NOT EXISTS (SELECT 1 FROM mdl_grade_grades gg
                  WHERE gg.itemid = h.itemid AND gg.userid = h.userid);

-- A4 · recálculo de todas las aulas tocadas
UPDATE mdl_grade_items gi
JOIN (SELECT DISTINCT aula FROM mdl_zz_restaurar_20260902) r ON r.aula = gi.courseid
SET gi.needsupdate = 1;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- V1 · cobertura: cada par debe tener su matrícula suspendida y sus notas
SELECT
  (SELECT COUNT(*) FROM mdl_zz_restaurar_20260902) AS pares,
  (SELECT COUNT(*) FROM mdl_zz_restaurar_20260902 r
    JOIN mdl_enrol e ON e.courseid = r.aula AND e.enrol = 'manual'
    JOIN mdl_user_enrolments ue ON ue.enrolid = e.id AND ue.userid = r.userid AND ue.status = 1)
    AS con_matricula_suspendida,
  (SELECT COUNT(DISTINCT CONCAT(gg.userid, '|', gi.courseid))
   FROM mdl_grade_grades gg
   JOIN mdl_grade_items gi ON gi.id = gg.itemid AND gi.itemtype = 'mod'
   JOIN mdl_zz_restaurar_20260902 r ON r.aula = gi.courseid AND r.userid = gg.userid
   WHERE gg.finalgrade IS NOT NULL) AS pares_con_notas_vivas;

-- V2 · pares SIN matrícula manual (aulas sin ese método: se reportan, quedan
-- con notas restauradas pero sin matrícula — decidiremos método alternativo)
SELECT r.aula, c.shortname, COUNT(*) AS pares_sin_metodo_manual
FROM mdl_zz_restaurar_20260902 r
JOIN mdl_course c ON c.id = r.aula
WHERE NOT EXISTS (SELECT 1 FROM mdl_enrol e WHERE e.courseid = r.aula AND e.enrol = 'manual')
GROUP BY r.aula, c.shortname;

-- V3 · (correr DESPUÉS del recálculo de Moodle) totales restaurados por par —
-- este resultado se me pega COMPLETO: con él aplico la decisión A en el ERP
-- (comparo contra la nota vigente y saco la lista de cruces de mínimo)
SELECT mu.idnumber, r.aula, c.shortname,
  ROUND(gg.finalgrade, 2) AS total_restaurado,
  ROUND(r.total_borrado, 2) AS total_historico
FROM mdl_zz_restaurar_20260902 r
JOIN mdl_user mu ON mu.id = r.userid
JOIN mdl_course c ON c.id = r.aula
JOIN mdl_grade_items gi ON gi.courseid = r.aula AND gi.itemtype = 'course'
LEFT JOIN mdl_grade_grades gg ON gg.itemid = gi.id AND gg.userid = r.userid
ORDER BY r.aula, mu.idnumber;
