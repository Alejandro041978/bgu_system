-- ---------------------------------------------------------------------------
-- Qué asignaturas son capstone. Marcadas a mano, no adivinadas por el nombre.
--
-- El capstone no se evalúa en el aula: se defiende. El aula existe y se queda
-- —el estudiante entra, se orienta, entrega— pero la nota no sale de ahí, así
-- que ese vínculo no debe traer calificaciones. Vínculo sí, sincronización no.
--
-- Buscar "capstone" en el título habría bastado hoy: las diez que hay se llaman
-- así. Pero es la misma trampa que ya nos costó cincuenta notas mal archivadas
-- con las aulas —el día que alguien cree "Trabajo Final de Grado" o "Capstone
-- I", la búsqueda de texto decide en silencio y se equivoca—. Aquí la marca la
-- pone una persona.
--
-- El insert de abajo es una SEMILLA, no la regla: deja marcadas las diez que
-- hoy se llaman capstone para no empezar de cero. Revísalas en la página y
-- corrige lo que falte o lo que sobre.
-- ---------------------------------------------------------------------------

alter table public.academic_courses
  add column if not exists is_capstone boolean not null default false;

comment on column public.academic_courses.is_capstone is
  'La nota nace de una defensa, no del aula. Su vínculo con Moodle da acceso pero nunca sincroniza calificaciones.';

-- Semilla: las que hoy se llaman capstone.
update public.academic_courses
   set is_capstone = true
 where name ilike '%capstone%'
   and is_capstone = false;

-- Y la consecuencia inmediata: ninguna aula de una asignatura capstone
-- sincroniza notas. Hoy son 22 de 24 vínculos los que la tienen encendida —no
-- ha llegado a escribir nada todavía, ni una sola nota de capstone lleva aula,
-- así que esto previene en vez de reparar.
update public.moodle_course_links
   set sync_enabled = false,
       sync_enabled_at = now()
 where sync_enabled = true
   and course_id in (select id from public.academic_courses where is_capstone);

-- Verificación
select
  (select count(*) from public.academic_courses where is_capstone)                  as asignaturas_capstone,
  (select count(*) from public.moodle_course_links l
     join public.academic_courses c on c.id = l.course_id
    where c.is_capstone)                                                            as vinculos_capstone,
  (select count(*) from public.moodle_course_links l
     join public.academic_courses c on c.id = l.course_id
    where c.is_capstone and l.sync_enabled)                                         as vinculos_que_aun_sincronizan;
