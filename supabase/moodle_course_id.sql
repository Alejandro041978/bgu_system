-- Las notas importadas de Moodle necesitan reconocer su aula de origen.
-- El esquema anterior codificaba el aula en el external_id ("moodle:{aula}:
-- {usuario}"), pero external_id es uuid: esos ids nunca pudieron existir y
-- el candado de acta / detección de desaparecidos quedaron rotos en silencio.
-- Ahora el external_id es un uuid estable (hash) y el aula vive aquí.
-- Ejecutar con "Run and enable RLS" (no crea tabla nueva, solo columna).
alter table academic_grades add column if not exists moodle_course_id integer;
create index if not exists academic_grades_moodle_course_idx on academic_grades (moodle_course_id);
