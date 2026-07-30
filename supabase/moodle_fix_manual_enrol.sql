-- ===========================================================================
-- MOODLE (MySQL vía N8N) — habilitar matriculación manual en las aulas que no
-- la tienen.
--
-- NO es para Supabase. Se ejecuta contra la base de Moodle.
--
-- Por qué: el ERP matricula con `enrol_manual_enrol_users`, que exige que el
-- curso tenga una instancia ACTIVA del plugin `manual`. Sin ella Moodle
-- responde `wsnoinstance` y el aula se queda sin estudiantes — y la importación
-- de notas entra, no encuentra a nadie y sale sin error (caso aula 669,
-- Módulo 05 - CEPAC: 75 estudiantes con la asignatura "En proceso").
--
-- Protocolo: 1) diagnóstico → 2) respaldo → 3) ajuste → 4) verificación →
-- 5) purgar cachés en Moodle.
-- ===========================================================================


-- ── 1. DIAGNÓSTICO (solo lectura) ──────────────────────────────────────────
-- Aulas SIN matriculación manual activa. Ejecutar primero y guardar el
-- resultado: es la lista de lo que se va a tocar.
SELECT c.id                                   AS aula_id,
       c.shortname,
       c.visible,
       GROUP_CONCAT(CONCAT(e.enrol, ':', IF(e.status = 0, 'activo', 'inactivo'))
                    ORDER BY e.enrol SEPARATOR ', ') AS metodos_actuales,
       SUM(e.enrol = 'manual')                AS instancias_manual,
       SUM(e.enrol = 'manual' AND e.status = 0) AS manual_activo,
       (SELECT COUNT(*) FROM mdl_user_enrolments ue
          JOIN mdl_enrol e2 ON e2.id = ue.enrolid
         WHERE e2.courseid = c.id)            AS matriculados
  FROM mdl_course c
  LEFT JOIN mdl_enrol e ON e.courseid = c.id
 WHERE c.id <> 1                                  -- 1 = portada del sitio
 GROUP BY c.id, c.shortname, c.visible
HAVING manual_activo = 0 OR manual_activo IS NULL
 ORDER BY matriculados DESC, c.id;


-- ── 2. RESPALDO (obligatorio antes de tocar nada) ──────────────────────────
CREATE TABLE mdl_enrol_bak_20260730 AS SELECT * FROM mdl_enrol;
-- Verificar que copió: SELECT COUNT(*) FROM mdl_enrol_bak_20260730;


-- ── 3a. AJUSTE: reactivar las instancias manuales DESHABILITADAS ───────────
-- Caso "existe pero está apagada": basta con encenderla.
UPDATE mdl_enrol
   SET status = 0, timemodified = UNIX_TIMESTAMP()
 WHERE enrol = 'manual' AND status <> 0;


-- ── 3b. AJUSTE: crear la instancia donde NO existe ─────────────────────────
-- El rol por defecto de la matriculación manual es "student".
-- El sortorder se calcula desde una tabla derivada: MySQL 5.7 no deja
-- subconsultar la propia tabla destino directamente (error 1093).
INSERT INTO mdl_enrol (enrol, status, courseid, sortorder, roleid, timecreated, timemodified)
SELECT 'manual',
       0,
       c.id,
       COALESCE(so.max_orden + 1, 0),
       (SELECT id FROM mdl_role WHERE shortname = 'student' LIMIT 1),
       UNIX_TIMESTAMP(),
       UNIX_TIMESTAMP()
  FROM mdl_course c
  LEFT JOIN (SELECT courseid, MAX(sortorder) AS max_orden
               FROM mdl_enrol GROUP BY courseid) so ON so.courseid = c.id
  LEFT JOIN (SELECT DISTINCT courseid FROM mdl_enrol WHERE enrol = 'manual') m ON m.courseid = c.id
 WHERE c.id <> 1
   AND m.courseid IS NULL;


-- ── 4. VERIFICACIÓN ────────────────────────────────────────────────────────
-- Debe devolver 0 filas.
SELECT c.id, c.shortname
  FROM mdl_course c
  LEFT JOIN mdl_enrol e ON e.courseid = c.id AND e.enrol = 'manual' AND e.status = 0
 WHERE c.id <> 1 AND e.id IS NULL;


-- ── 5. PURGAR CACHÉS (imprescindible) ──────────────────────────────────────
-- Moodle cachea las instancias de matriculación por curso: hasta purgar, el
-- webservice sigue respondiendo `wsnoinstance` aunque la fila ya exista.
--   Administración del sitio → Desarrollo → Purgar todas las cachés
-- Después, en el ERP: Auditor del Campus → Auditar, y la tarjeta "Sin
-- matriculación manual" debe quedar en 0.


-- ── Reversa, si algo sale mal ──────────────────────────────────────────────
-- DELETE e FROM mdl_enrol e
--   LEFT JOIN mdl_enrol_bak_20260730 b ON b.id = e.id
--  WHERE b.id IS NULL;                       -- borra solo lo insertado hoy
-- UPDATE mdl_enrol e JOIN mdl_enrol_bak_20260730 b ON b.id = e.id
--    SET e.status = b.status WHERE e.status <> b.status;
