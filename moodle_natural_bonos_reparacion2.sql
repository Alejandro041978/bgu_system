-- ---------------------------------------------------------------------------
-- REPARACIÓN 2 DE LA CONVERSIÓN NATURAL (25/08/2026) · MySQL 5.7, un paso por nodo
--
-- QUÉ PASÓ: el 4a y el 4d reescalaron finalgrade y rawgrademax pero NO
-- rawgrade, que quedó en la escala vieja (sobre 100). Al recalcular, Moodle
-- manda desde el crudo: encontró 85 contra un máximo declarado de 4.16667 y lo
-- recortó al máximo — nota completa en cada ítem rendido, incluidos los bonos
-- (5/5 para todo Live Class Quiz con nota). Confirmado en el aula 486.
--
-- LA REPARACIÓN: recomputar crudo y final DESDE EL RESPALDO, exactos:
--   rawgrade  = crudo_respaldo  / rawgrademax_respaldo × máximo_nuevo
--   finalgrade = final_respaldo / máximo_viejo_del_ítem × máximo_nuevo
-- Con crudo y máximos consistentes, el recálculo deja el final = crudo sin
-- recortes. Nada se pierde: solo bajan las notas infladas a su valor real.
-- ---------------------------------------------------------------------------

-- ═══ PASO 0 · CREDENCIAL: debe devolver "ECT 103…" y "Ciberdefensa…" ═══
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);


-- ═══ PASO R1 · Recomputar crudo y final desde el respaldo (las 349) ═══
-- Solo ítems que hoy pesan o son bono (grademax > 0). NULLIF evita división
-- por cero; el NULL se propaga (quien no tenía crudo sigue sin crudo).
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
JOIN bak_nb_lote l ON l.courseid = gi.courseid
JOIN bak_nb_grade_grades b ON b.id = gg.id
JOIN bak_nb_grade_items bi ON bi.id = gi.id
SET gg.rawgrade   = b.rawgrade   / NULLIF(b.rawgrademax, 0) * gi.grademax,
    gg.finalgrade = b.finalgrade / NULLIF(bi.grademax, 0)   * gi.grademax
WHERE gi.itemtype = 'mod' AND gi.grademax > 0;


-- ═══ PASO R2 · Lo mismo para el aula piloto 637 (respaldo bak_637_*) ═══
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
JOIN bak_637_grade_grades b ON b.id = gg.id
JOIN bak_637_grade_items bi ON bi.id = gi.id
SET gg.rawgrade   = b.rawgrade   / NULLIF(b.rawgrademax, 0) * gi.grademax,
    gg.finalgrade = b.finalgrade / NULLIF(bi.grademax, 0)   * gi.grademax
WHERE gi.courseid = 637 AND gi.itemtype = 'mod' AND gi.grademax > 0;


-- ═══ PASO R3 · VERIFICACIÓN EN FRÍO ═══
-- R3a · Ya no debe existir crudo por encima de su máximo declarado (esa era
-- la condición del recorte). Debe dar 0 y 0.
SELECT
  SUM(CASE WHEN gg.rawgrade   > gg.rawgrademax + 0.01 THEN 1 ELSE 0 END) AS crudos_sobre_su_maximo,
  SUM(CASE WHEN gg.finalgrade > gi.grademax    + 0.01 THEN 1 ELSE 0 END) AS finales_sobre_el_maximo
FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
JOIN bak_nb_lote l ON l.courseid = gi.courseid
WHERE gi.itemtype = 'mod' AND gi.grademax > 0
  AND (gg.rawgrade IS NOT NULL OR gg.finalgrade IS NOT NULL);

-- R3b · Muestra del aula 486 (la del +64.17): el final de cada ítem debe ser
-- crudo% × máximo (p. ej. crudo 50/100 → 4.167 de 8.333), no el máximo.
SELECT gi.itemname, gg.userid,
  ROUND(gg.rawgrade, 3) AS crudo, ROUND(gg.rawgrademax, 3) AS crudo_max,
  ROUND(gg.finalgrade, 3) AS final, ROUND(gi.grademax, 3) AS max_item
FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
WHERE gi.courseid = 486 AND gi.itemtype = 'mod' AND gg.finalgrade IS NOT NULL
ORDER BY gg.userid, gi.id;


-- ═══ PASO R4 · Marcar recálculo (lote + 637) ═══
UPDATE mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
SET gi.needsupdate = 1;

UPDATE mdl_grade_items SET needsupdate = 1 WHERE courseid = 637;
