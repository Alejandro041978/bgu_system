-- ===========================================================================
-- Las 44 inscripciones que quedaban, fuera de la tabla de calificaciones
--
-- Son las cuatro asignaturas que SystemActiva traía con nombres que no
-- existían en ninguna malla. Registros dio la equivalencia el 15-08-2026:
--
--   Leadership and Managing Team Dynamics  → SPC 0001 Specialization Course 1
--   Qualitative Research II                → QRE 8645 Qualitative Research
--   Business Leadership & Entrepreneurship → LED 380  Business Leadership
--   Capstone of Hotel Management           → HMG 700  Hospitality Mgmt Capstone
--
-- Ya se les escribió el course_id y se les abrió la matrícula —a 5 les
-- faltaba—, así que su inscripción vive en el registro y estas filas ya no
-- guardan nada. Las 7 que sí traían nota se quedan: son calificaciones.
--
-- Mismo procedimiento que las 6.584 del mismo día. Correr entero.
-- ===========================================================================

BEGIN;

CREATE TEMP TABLE candidatas AS
SELECT DISTINCT ON (g.external_id)
       g.external_id,
       g.semester_id  AS sem_nota,
       ce.id          AS matricula_id,
       ce.status,
       ce.semester_id AS sem_matricula
FROM academic_grades g
JOIN academic_students s
     ON s.document_number = g.document_number
JOIN academic_course_enrollments ce
     ON ce.student_id = s.id AND ce.course_id = g.course_id
WHERE g.withdrawn_at IS NULL
  AND g.final_grade  IS NULL
  AND g.retake_grade IS NULL
  AND g.course_id    IS NOT NULL
ORDER BY g.external_id, (ce.id = g.course_enrollment_id) DESC, ce.attempt DESC;

-- El tope, con el mismo criterio que la otra vez: lo que no puede pasar es que
-- SUBA —eso significaría que algo está creando inscripciones aquí de nuevo—.
-- Que baje una o dos es el campus calificando, y es sano.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM candidatas;
  IF n > 44 THEN
    RAISE EXCEPTION 'Hay % inscripciones sin calificar y se midieron 44. Subió: algo las está creando. No se borra nada.', n;
  END IF;
  IF n < 35 THEN
    RAISE EXCEPTION 'Hay solo % de las 44 medidas. Cayó demasiado para ser el campus calificando. No se borra nada.', n;
  END IF;
  RAISE NOTICE 'Se van a sacar % inscripciones de la tabla de calificaciones.', n;
END $$;

-- Respaldo, a la misma tabla del 15-08.
INSERT INTO academic_grades_inscripciones_2026_08_15
SELECT g.* FROM academic_grades g
JOIN candidatas c ON c.external_id = g.external_id;

-- El semestre de la nota no se puede perder: si la matrícula no lo tiene, o lo
-- tiene más viejo y sigue en curso, se queda el de la fila que se va.
WITH ultimo AS (
  SELECT c.matricula_id, c.sem_nota,
         row_number() OVER (PARTITION BY c.matricula_id ORDER BY sn.start_date DESC) AS rn
  FROM candidatas c
  JOIN academic_semesters sn ON sn.id = c.sem_nota
  LEFT JOIN academic_semesters sm ON sm.id = c.sem_matricula
  WHERE c.status = 'en_curso'
    AND (sm.start_date IS NULL OR sn.start_date > sm.start_date)
)
UPDATE academic_course_enrollments ce
SET semester_id = u.sem_nota
FROM ultimo u
WHERE ce.id = u.matricula_id AND u.rn = 1;

DELETE FROM academic_grades g
USING candidatas c
WHERE g.external_id = c.external_id;

COMMIT;

-- Debe decir: quedan 0. La tabla de calificaciones pasa a guardar solo notas.
SELECT
  (SELECT count(*) FROM academic_grades_inscripciones_2026_08_15) AS respaldadas_en_total,
  (SELECT count(*) FROM academic_grades
    WHERE withdrawn_at IS NULL AND final_grade IS NULL AND retake_grade IS NULL) AS quedan,
  (SELECT count(*) FROM academic_grades) AS notas_totales;
