-- ============================================================================
-- AUDITORÍA DE ACTAS APROBADAS EN EL ARBITRAJE — detalle por ítem (solo lectura)
-- MySQL 5.7 · un statement por nodo N8N · prefijo mdl_
-- 18 actas / 15 aulas. Objetivo: reconstruir el detalle y recalcular el
-- acumulado sobre el 100% (patrón ACC 430: total del histórico inflado).
-- ============================================================================

-- PASO 0 · comprobación de credenciales (debe devolver "ECT 103..." y
-- "Ciberdefensa..."; si no, DETENERSE: N8N apunta a otra base)
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);

-- PASO 1 · estructura de ítems de las 15 aulas (incluye course y category)
SELECT gi.courseid AS aula, gi.id AS itemid, gi.categoryid, gi.itemtype,
  gi.itemmodule, gi.itemname, ROUND(gi.grademax, 2) AS grademax,
  gi.aggregationcoef, gi.aggregationcoef2, gi.weightoverride
FROM mdl_grade_items gi
WHERE gi.courseid IN (126, 134, 135, 137, 304, 324, 337, 345, 357, 363, 391, 401, 434, 442, 614)
ORDER BY gi.courseid, gi.sortorder;

-- PASO 2 · categorías de esas aulas (jerarquía y método de agregación)
SELECT id, courseid AS aula, parent, fullname, aggregation
FROM mdl_grade_categories
WHERE courseid IN (126, 134, 135, 137, 304, 324, 337, 345, 357, 363, 391, 401, 434, 442, 614)
ORDER BY courseid, id;

-- PASO 3 · nota ACTUAL de cada ítem por par (aula, estudiante)
SELECT gi.courseid AS aula, u.idnumber, gi.id AS itemid,
  ROUND(gg.finalgrade, 2) AS nota, ROUND(gg.rawgrademax, 2) AS max_crudo,
  FROM_UNIXTIME(gg.timemodified) AS modificada
FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
JOIN mdl_user u ON u.id = gg.userid AND u.deleted = 0
WHERE gg.finalgrade IS NOT NULL
  AND (gi.courseid, u.idnumber) IN (
    (137, '1a94eb44-3f7d-42b3-8453-3865af21f3f3'),
    (345, '4d65daf4-f808-4282-98d2-37d6bad9ca84'),
    (324, '6893ee1a-d625-42fc-b32b-3af6dd2df884'),
    (357, '1799effb-d4b3-4b74-9fed-69d3e2745c50'),
    (304, '923d8143-33c0-41bc-a29b-be413491a63d'),
    (442, 'd548a959-f0d8-439f-baf9-5470f6b5a303'),
    (134, 'f4c23ff4-180a-490d-a05d-7e10fca38ff9'),
    (135, '1cfb6d6c-3950-4cb4-8424-fda4e6c96a0d'),
    (434, 'f68072d8-019c-47b8-a6a8-4b92235f712e'),
    (337, '19042fcd-314d-4978-840a-c5a178d3c9b6'),
    (442, 'cf2d6318-b574-4bb8-a416-8544f858576a'),
    (401, 'cb6c7edc-485c-41d2-baf2-c081fa7e7581'),
    (391, 'a3bab236-bca0-438f-a328-33576c3b26d2'),
    (614, 'a553cd8d-6d75-4280-8bf5-5441a91b1000'),
    (126, '87f007f6-76ab-4ea4-9e65-822ac26a9dff'),
    (363, 'a728e1a2-cfb4-4e49-8559-38441aa5e9da'),
    (391, 'cdc7b249-860d-4e0b-a161-69683f14c0a2'),
    (126, 'd37bf83e-460d-4544-a3f1-a93fad543c4a'));
