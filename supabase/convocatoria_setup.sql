-- ============================================================================
-- La convocatoria define el PAR de cada programa: colección + carrusel.
--
-- Reparto de responsabilidades (regla del usuario, 2026-08-10):
--   · el CARRUSEL dice QUÉ asignaturas se cursan y EN QUÉ ORDEN
--   · la COLECCIÓN dice EN QUÉ AULA de cada asignatura entra el estudiante
--     (la regular, la del upgrade, la del campus socio, la que se dicta en
--      inglés — una asignatura tiene varias aulas y la colección elige)
--   · la CONVOCATORIA (intake) declara ambas cosas por programa, y la
--     matrícula las hereda
--
-- Hasta hoy la colección era un campo suelto del formulario de matrícula:
-- 23 de 1.104 matrículas de estudiantes activos lo tenían puesto. Sin él, el
-- aprovisionamiento de Moodle cae a un respaldo de julio —el aula pegada a
-- semester_offerings— que tiene sitio para UN aula por asignatura. Es decir:
-- un estudiante del campus socio y uno de la colección regular que compartan
-- carrusel aterrizan hoy en la misma aula, porque esa vía no sabe expresar la
-- diferencia. La estructura para distinguirlos existe desde el 1 de agosto;
-- lo que faltaba era quién decide, y ese quién es la convocatoria.
--
-- Ejecutar en Supabase (idempotente).
-- ============================================================================

create table if not exists convocatoria_program_setup (
  convocatoria_id uuid not null references convocatorias(id) on delete cascade,
  program_id      uuid not null references academic_programs(id) on delete cascade,
  -- on delete restrict a propósito: borrar una colección o un carrusel que una
  -- convocatoria está usando no puede ser un descuido silencioso.
  collection_id   uuid references moodle_collections(id) on delete restrict,
  group_id        uuid references academic_groups(id)    on delete restrict,
  updated_at      timestamptz not null default now(),
  updated_by      text,
  -- Una decisión por (convocatoria, programa). No caben dos.
  primary key (convocatoria_id, program_id)
);

create index if not exists idx_cps_convocatoria on convocatoria_program_setup (convocatoria_id);

alter table convocatoria_program_setup enable row level security;
grant all on table convocatoria_program_setup to service_role;

comment on table convocatoria_program_setup is
  'Por convocatoria y programa: en qué colección de aulas y en qué carrusel entra el matriculado.';

-- ── Se retira convocatoria_groups ──────────────────────────────────────────
-- Nació el 08-07 para vincular un carrusel de entrada por programa. Nunca se
-- llegó a usar: cero filas y ninguna línea de código la consulta. Su intención
-- —"la API reemplaza si se vincula otro del mismo programa"— es justo lo que
-- aquí garantiza la llave primaria, y además cabe la colección, que era la
-- mitad que faltaba. Dejarla viva sería una tercera vía para decir lo mismo,
-- que es exactamente el problema que este cambio viene a cerrar.
drop table if exists convocatoria_groups;

select
  (select count(*) from convocatoria_program_setup) as pares_configurados,
  (select count(*) from convocatorias)              as convocatorias;
