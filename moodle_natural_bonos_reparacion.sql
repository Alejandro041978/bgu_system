-- ---------------------------------------------------------------------------
-- REPARACIÓN DE LA CONVERSIÓN NATURAL + BONOS (24/08/2026)
-- MySQL 5.7 vía N8N, un paso por nodo.
--
-- QUÉ PASÓ: en el paquete de aplicación, el 4e convirtió los ítems ponderados
-- (peso → máximo) y les dejó aggregationcoef = 0; el 4f, que corrió después,
-- decía "ítems con coef 0 → máximo 0" y les pisó el máximo a TODOS los ítems
-- recién convertidos. Resultado: aulas del lote con total 0. Las notas de los
-- alumnos NO se perdieron: los finalgrade quedaron correctamente reescalados
-- por el 4a (y rawgrademax guarda la escala buena); solo el máximo del ítem
-- quedó en 0. La compuerta del importador del ERP rechazó esas aulas
-- ("escala 0"), así que al ERP no entró nada malo.
--
-- LA REPARACIÓN: reponer el máximo de cada ítem desde el respaldo
-- (bak_nb_grade_items tiene los coeficientes originales), con la MISMA
-- normalización que usó el 4a sobre las notas — así ítem y notas vuelven a
-- ser consistentes. Luego, en las aulas donde los Live Class Quiz tenían peso
-- propio (al volverse extra credit salen de la base y los máximos no suman
-- 100), una segunda pasada renormaliza máximos Y notas por el mismo factor.
-- ---------------------------------------------------------------------------

-- ═══ PASO 0 · CREDENCIAL ═══
-- Debe devolver "ECT 103…" y "Ciberdefensa…". Si no, DETENER.
SELECT id, shortname FROM mdl_course WHERE id IN (330, 425);


-- ═══ PASO R1 · Reponer el máximo de los ítems convertidos desde el respaldo ═══
-- Misma fórmula y mismo denominador que usó el 4a con las notas
-- (coef original × 100 / suma de coefs originales del aula).
UPDATE mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
JOIN bak_nb_grade_items b ON b.id = gi.id
JOIN (SELECT courseid, SUM(aggregationcoef) s
      FROM bak_nb_grade_items
      WHERE itemtype = 'mod' AND aggregationcoef > 0
      GROUP BY courseid) t ON t.courseid = gi.courseid
SET gi.grademax = b.aggregationcoef * 100 / t.s, gi.grademin = 0
WHERE gi.itemtype = 'mod' AND b.aggregationcoef > 0
  AND gi.itemname NOT LIKE 'Live Class Quiz%';


-- ═══ PASO R2 · ¿En qué aulas los máximos no suman 100? ═══
-- Esperado: solo las aulas donde los Live Class Quiz tenían peso propio
-- (su peso salió de la base al volverse extra credit). Esas se renormalizan
-- en R3. Si sale vacío, saltar R3 e ir directo a R4.
SELECT gi.courseid AS aula, ROUND(SUM(gi.grademax), 3) AS suma_maximos
FROM mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
WHERE gi.itemtype = 'mod' AND gi.aggregationcoef = 0 AND gi.grademax > 0
GROUP BY gi.courseid
HAVING ABS(suma_maximos - 100) > 0.1
ORDER BY gi.courseid;


-- ═══ PASO R3 · Renormalizar esas aulas a base 100 (máximos Y notas) ═══
-- El factor es 100 / suma_actual y se aplica igual a todo, así los
-- porcentajes de cada alumno no cambian. ORDEN: primero las notas y los
-- módulos (leen la suma de los ítems, que aún no cambió), los ítems AL FINAL.

-- R3a · Notas del libro
UPDATE mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
JOIN bak_nb_lote l ON l.courseid = gi.courseid
JOIN (SELECT courseid, SUM(grademax) sm FROM mdl_grade_items
      WHERE itemtype = 'mod' AND aggregationcoef = 0 AND grademax > 0
      GROUP BY courseid) x ON x.courseid = gi.courseid
SET gg.finalgrade = gg.finalgrade * 100 / x.sm,
    gg.rawgrademax = gg.rawgrademax * 100 / x.sm
WHERE gi.itemtype = 'mod' AND gi.aggregationcoef = 0 AND gi.grademax > 0
  AND gg.finalgrade IS NOT NULL
  AND ABS(x.sm - 100) > 0.1;

-- R3b · Notas y máximo de los QUIZ de esas aulas
UPDATE mdl_quiz_grades qg
JOIN mdl_quiz q ON q.id = qg.quiz
JOIN mdl_grade_items gi ON gi.itemmodule = 'quiz' AND gi.iteminstance = q.id AND gi.itemtype = 'mod'
JOIN bak_nb_lote l ON l.courseid = q.course
JOIN (SELECT courseid, SUM(grademax) sm FROM mdl_grade_items
      WHERE itemtype = 'mod' AND aggregationcoef = 0 AND grademax > 0
      GROUP BY courseid) x ON x.courseid = q.course
SET qg.grade = qg.grade * 100 / x.sm
WHERE gi.aggregationcoef = 0 AND gi.grademax > 0
  AND ABS(x.sm - 100) > 0.1;

UPDATE mdl_quiz q
JOIN mdl_grade_items gi ON gi.itemmodule = 'quiz' AND gi.iteminstance = q.id AND gi.itemtype = 'mod'
JOIN bak_nb_lote l ON l.courseid = q.course
JOIN (SELECT courseid, SUM(grademax) sm FROM mdl_grade_items
      WHERE itemtype = 'mod' AND aggregationcoef = 0 AND grademax > 0
      GROUP BY courseid) x ON x.courseid = q.course
SET q.grade = q.grade * 100 / x.sm
WHERE gi.aggregationcoef = 0 AND gi.grademax > 0
  AND ABS(x.sm - 100) > 0.1;

-- R3c · Notas y máximo de los ASSIGN de esas aulas
UPDATE mdl_assign_grades ag
JOIN mdl_assign a ON a.id = ag.assignment
JOIN mdl_grade_items gi ON gi.itemmodule = 'assign' AND gi.iteminstance = a.id AND gi.itemtype = 'mod'
JOIN bak_nb_lote l ON l.courseid = a.course
JOIN (SELECT courseid, SUM(grademax) sm FROM mdl_grade_items
      WHERE itemtype = 'mod' AND aggregationcoef = 0 AND grademax > 0
      GROUP BY courseid) x ON x.courseid = a.course
SET ag.grade = ag.grade * 100 / x.sm
WHERE gi.aggregationcoef = 0 AND gi.grademax > 0 AND ag.grade >= 0
  AND ABS(x.sm - 100) > 0.1;

UPDATE mdl_assign a
JOIN mdl_grade_items gi ON gi.itemmodule = 'assign' AND gi.iteminstance = a.id AND gi.itemtype = 'mod'
JOIN bak_nb_lote l ON l.courseid = a.course
JOIN (SELECT courseid, SUM(grademax) sm FROM mdl_grade_items
      WHERE itemtype = 'mod' AND aggregationcoef = 0 AND grademax > 0
      GROUP BY courseid) x ON x.courseid = a.course
SET a.grade = a.grade * 100 / x.sm
WHERE gi.aggregationcoef = 0 AND gi.grademax > 0
  AND ABS(x.sm - 100) > 0.1;

-- R3d · Los ítems, AL FINAL (esto cambia la suma, por eso van últimos)
UPDATE mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
JOIN (SELECT courseid, SUM(grademax) sm FROM mdl_grade_items
      WHERE itemtype = 'mod' AND aggregationcoef = 0 AND grademax > 0
      GROUP BY courseid) x ON x.courseid = gi.courseid
SET gi.grademax = gi.grademax * 100 / x.sm
WHERE gi.itemtype = 'mod' AND gi.aggregationcoef = 0 AND gi.grademax > 0
  AND ABS(x.sm - 100) > 0.1;


-- ═══ PASO R4 · Verificación en frío + marcar recálculo ═══
-- R4a · Ahora TODAS las aulas del lote deben sumar 100 en ítems sin extra.
-- Debe devolver 0 filas.
SELECT gi.courseid AS aula, ROUND(SUM(gi.grademax), 3) AS suma_maximos
FROM mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
WHERE gi.itemtype = 'mod' AND gi.aggregationcoef = 0 AND gi.grademax > 0
GROUP BY gi.courseid
HAVING ABS(suma_maximos - 100) > 0.1;

-- R4b · Consistencia ítem-nota: la nota nunca puede superar el máximo del
-- ítem (tolerancia de redondeo). Debe devolver 0.
SELECT COUNT(*) AS notas_sobre_el_maximo
FROM mdl_grade_grades gg
JOIN mdl_grade_items gi ON gi.id = gg.itemid
JOIN bak_nb_lote l ON l.courseid = gi.courseid
WHERE gi.itemtype = 'mod' AND gg.finalgrade IS NOT NULL
  AND gg.finalgrade > gi.grademax + 0.01;

-- R4c · Marcar recálculo de todo el lote
UPDATE mdl_grade_items gi
JOIN bak_nb_lote l ON l.courseid = gi.courseid
SET gi.needsupdate = 1;
