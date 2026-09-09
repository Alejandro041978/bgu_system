-- ---------------------------------------------------------------------------
-- Electivas — corrección del usuario (08/09/2026): una opción pertenece a UN
-- solo pool (una asignatura no puede estar en dos especialidades).
--
-- Antes de aplicar el candado, este SELECT muestra si ya hay duplicadas (debe
-- devolver 0 filas; si devuelve algo, quitar la opción del pool que no
-- corresponde en Programas › Electivas y recién correr el ALTER).
-- ---------------------------------------------------------------------------

SELECT course_id, count(*) AS pools
FROM elective_pool_courses
GROUP BY course_id
HAVING count(*) > 1;

ALTER TABLE elective_pool_courses
  ADD CONSTRAINT elective_pool_courses_course_unique UNIQUE (course_id);
