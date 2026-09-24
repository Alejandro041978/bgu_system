-- ---------------------------------------------------------------------------
-- Una asignatura tiene UN solo aula por colección (regla confirmada por el
-- usuario, 24/09/2026). La otra mitad de la regla —un aula vive en un solo
-- vínculo, con una sola asignatura y una sola colección— ya la garantiza la
-- clave primaria de moodle_course_links (aula_id).
--
-- Hoy los datos ya lo cumplen (619 vínculos vivos, 0 excepciones). Aplica a
-- vínculos VIVOS de tipo 'asignatura' con colección; los 13 vínculos sin
-- colección (PSY 106 y COM 205 con varias aulas viejas) quedan fuera: esa
-- decisión es aparte.
--
-- Correr en el SQL Editor de Supabase. Si algo viola la regla, falla y nombra
-- la fila.
-- ---------------------------------------------------------------------------
create unique index if not exists moodle_course_links_un_aula_por_asignatura_y_coleccion
  on moodle_course_links (course_id, collection_id)
  where replaced_at is null and kind = 'asignatura' and collection_id is not null;

comment on index moodle_course_links_un_aula_por_asignatura_y_coleccion is
  'Una asignatura tiene un solo aula por colección (vínculos vivos).';

-- Comprobación: debe devolver 1 fila
select indexname from pg_indexes
 where tablename = 'moodle_course_links' and indexname = 'moodle_course_links_un_aula_por_asignatura_y_coleccion';
