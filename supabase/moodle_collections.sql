-- ===========================================================================
-- Colecciones de aulas
--
-- Una colección es la malla de un programa con un aula en cada casilla. El
-- bachelor en administración tiene 40 asignaturas y 137 aulas, y no están
-- repartidas al azar: son tres colecciones casi completas —la regular, la del
-- upgrade y la del campus asociado— más un juego de plantillas vacías.
--
-- Hasta ahora eso vivía como texto: el sufijo del nombre del aula ("- CVC",
-- "- UP BSBA") y una deducción. Servía para adivinar el programa, no para
-- preguntar si una colección está completa ni para encender la sincronía de
-- todas sus aulas a la vez.
--
-- REGLA: una casilla, un aula. Si se crea un aula nueva con otros recursos,
-- ocupa la posición y la anterior sale de la colección — pero conserva su
-- identidad (qué asignatura enseña) y puede seguir sincronizando hasta que
-- nadie tenga registros pendientes dentro. Los alumnos que quedaron a mitad
-- de curso no se congelan.
-- ===========================================================================

create table if not exists moodle_collections (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references academic_programs(id) on delete cascade,
  name         text not null,
  -- es | en — el idioma en que se dicta esa colección
  language     text,
  -- sigla del socio externo cuando corresponde (CVC, UNDC…)
  partner      text,
  -- Sufijo con el que se nombran sus aulas en Moodle ("UP BSBA", "CVC"). Sirve
  -- para proponer automáticamente qué aula va en qué casilla.
  suffix       text,
  active       boolean not null default true,
  nota         text,
  created_at   timestamptz not null default now(),
  created_by   text,

  constraint moodle_collections_nombre_unico unique (program_id, name)
);

create index if not exists idx_mcol_program on moodle_collections (program_id);

alter table moodle_collections enable row level security;
grant all on table moodle_collections to service_role;


-- ── El vínculo pasa a pertenecer a una colección ───────────────────────────
alter table moodle_course_links
  add column if not exists collection_id uuid references moodle_collections(id) on delete set null,
  -- Cuándo dejó su casilla porque otra aula la reemplazó. El vínculo con la
  -- asignatura se conserva: el aula sigue sabiendo qué enseña, y sus alumnos
  -- pueden terminar.
  add column if not exists replaced_at   timestamptz,
  add column if not exists replaced_by   text;

create index if not exists idx_mcl_collection on moodle_course_links (collection_id);

-- Una casilla, un aula: dentro de una colección no puede haber dos aulas para
-- la misma asignatura. Es un índice parcial porque los vínculos sin colección
-- —y las aulas no curriculares— quedan fuera de la regla.
create unique index if not exists idx_mcl_una_casilla_un_aula
  on moodle_course_links (collection_id, course_id)
  where collection_id is not null and course_id is not null;


-- ── Verificación ───────────────────────────────────────────────────────────
select
  (select count(*) from moodle_collections)                                   as colecciones,
  (select count(*) from moodle_course_links where collection_id is not null)  as aulas_en_coleccion,
  (select count(*) from moodle_course_links)                                  as aulas_vinculadas;
