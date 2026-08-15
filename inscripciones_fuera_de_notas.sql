-- ===========================================================================
-- Sacar las inscripciones sin calificar de la tabla de calificaciones
--
-- 6.585 filas de SystemActiva que no guardan ninguna nota: existían solo para
-- que el acta pudiera deducir "en proceso" de que hubiera una fila. Desde el
-- commit de hoy el acta lo lee del registro por asignatura, y las 6.585 tienen
-- su matrícula abierta ahí. Se comprobó sobre las 39.411 asignaturas de las
-- 2.040 matrículas: borrarlas no cambia ni un solo estado del acta.
--
-- NO se tocan las 53 sin course_id (Leadership and Managing Team Dynamics,
-- Qualitative Research II, Assessment of the Individual...): esas asignaturas
-- no están en ninguna malla y siguen esperando decisión de Registros. Son la
-- única información que queda de esas inscripciones.
--
-- Correr entero, de una vez. Las cuatro partes son una sola operación: si algo
-- no cuadra, aborta sin borrar nada.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Quiénes son. Se define una sola vez y todo lo demás lee de aquí, para que
--    el respaldo, el traslado del semestre y el borrado no puedan discrepar.
--
--    DISTINCT ON no es cosmético: 797 pares (estudiante, asignatura) tienen más
--    de un intento abierto, y sin él cada una de esas notas saldría repetida.
--    Se queda con la matrícula a la que la nota ya apunta, y si no apunta a
--    ninguna, con el intento más alto.
-- ---------------------------------------------------------------------------
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

-- El tope. Si el número no es el que se midió, algo cambió desde entonces y
-- nada de lo que sigue es de fiar: aborta la transacción entera.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM candidatas;
  IF n <> 6585 THEN
    RAISE EXCEPTION 'Se esperaban 6585 inscripciones sin calificar y hay %. No se borra nada.', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Respaldo. Queda como tabla en la base, no como un archivo que se pierde.
--    Si mañana falta algo, de aquí se repone tal cual estaba.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_grades_inscripciones_2026_08_15
  AS SELECT * FROM academic_grades WHERE false;

-- Cerrada como todo el esquema. Solo la service_role la lee.
ALTER TABLE academic_grades_inscripciones_2026_08_15 ENABLE ROW LEVEL SECURITY;

INSERT INTO academic_grades_inscripciones_2026_08_15
SELECT g.* FROM academic_grades g
JOIN candidatas c ON c.external_id = g.external_id;

-- ---------------------------------------------------------------------------
-- 2. El semestre no se puede perder.
--
--    167 de estas filas tienen un semestre distinto al de su matrícula: el
--    mismo estudiante cursó la misma asignatura en varios periodos y todos
--    quedaron colgando de un mismo intento. En 41 casos la fila vacía es la
--    MÁS RECIENTE y la matrícula sigue en curso: ése es el periodo que está
--    cursando ahora, y es el que debe quedar escrito.
--
--    No se toca el semestre de las matrículas ya aprobadas o reprobadas: ahí
--    el periodo es el de la nota que las cerró, y adelantarlo sería mentir
--    sobre cuándo aprobó.
-- ---------------------------------------------------------------------------
WITH ultimo AS (
  SELECT c.matricula_id, c.sem_nota,
         row_number() OVER (PARTITION BY c.matricula_id ORDER BY sn.start_date DESC) AS rn
  FROM candidatas c
  JOIN academic_semesters sn ON sn.id = c.sem_nota
  JOIN academic_semesters sm ON sm.id = c.sem_matricula
  WHERE c.status = 'en_curso'
    AND sn.start_date > sm.start_date
)
UPDATE academic_course_enrollments ce
SET semester_id = u.sem_nota
FROM ultimo u
WHERE ce.id = u.matricula_id AND u.rn = 1;

-- ---------------------------------------------------------------------------
-- 3. Fuera de las calificaciones.
-- ---------------------------------------------------------------------------
DELETE FROM academic_grades g
USING candidatas c
WHERE g.external_id = c.external_id;

COMMIT;

-- Cómo quedó. Debe decir: respaldadas 6585 · sin calificar que quedan 53.
SELECT
  (SELECT count(*) FROM academic_grades_inscripciones_2026_08_15) AS respaldadas,
  (SELECT count(*) FROM academic_grades
    WHERE withdrawn_at IS NULL AND final_grade IS NULL AND retake_grade IS NULL) AS quedan,
  (SELECT count(*) FROM academic_grades) AS notas_totales;
