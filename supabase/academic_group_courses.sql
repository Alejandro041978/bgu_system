-- ============================================================================
-- Las asignaturas son del CARRUSEL, no de la oferta.
--
-- Reparto (regla del usuario, 2026-08-10):
--   · la OFERTA dice cuándo y quién: semestre, fechas, docente, cronograma.
--     Es lo que conecta con contratos y carga docente, y se rehace cada
--     semestre.
--   · el CARRUSEL dice qué y en qué orden: es el plan de estudios, la ruta.
--     Casi nunca cambia.
--
-- Hasta hoy el carrusel no tenía asignaturas propias: se las pedía prestadas a
-- semester_offerings. Eso metía el año y el semestre por la puerta de atrás, y
-- costó tres cosas, todas medidas el 10-08-2026:
--
--   · duplicación — 19 de 44 carruseles repetían la misma asignatura, una vez
--     por semestre. MBA_SP0 tenía 31 ofertas para 14 asignaturas, así que
--     "cuántas asignaturas tiene este carrusel" no tenía respuesta.
--   · marchitamiento — la lista dependía de que alguien creara las ofertas del
--     año nuevo y las enganchara. Seis carruseles habían quedado en cero.
--   · 17 estudiantes activos atascados en DCEA_021, un carrusel sin ninguna
--     asignatura: el motor nunca da por completado un carrusel vacío —avanzar
--     por vacío regalaría el programa—, así que no podían avanzar nunca. Y
--     tener una ruta que no lleva a ningún sitio se ve mejor en los reportes
--     que no tener ruta.
--
-- Ejecutar en Supabase (idempotente).
-- ============================================================================

create table if not exists academic_group_courses (
  group_id   uuid not null references academic_groups(id) on delete cascade,
  -- restrict: sacar del plan una asignatura que un carrusel dicta no puede
  -- pasar de largo. Que falle y se decida.
  course_id  uuid not null references academic_courses(id) on delete restrict,
  -- Solo para presentarlas ordenadas: dentro de un carrusel se cursan todas a
  -- la vez (el carrusel vigente pone todas sus asignaturas En proceso).
  orden      int,
  created_at timestamptz not null default now(),
  created_by text,
  -- Una asignatura no se repite dentro de un carrusel. La MISMA asignatura sí
  -- puede estar en carruseles distintos: es lo que necesitan el regular y el
  -- upgrade.
  primary key (group_id, course_id)
);

create index if not exists idx_agc_course on academic_group_courses (course_id);

alter table academic_group_courses enable row level security;
grant all on table academic_group_courses to service_role;

comment on table academic_group_courses is
  'Asignaturas que integran cada carrusel. El plan de estudios de la ruta; la oferta solo dice cuándo y quién.';

-- ── Volcado del contenido actual ────────────────────────────────────────────
-- Las asignaturas ÚNICAS de las ofertas de cada grupo son exactamente lo que
-- ese carrusel dicta hoy: no se decide nada, se deja de duplicar. Los
-- carruseles que hoy están vacíos siguen vacíos — y ahora se ven.
insert into academic_group_courses (group_id, course_id, created_by)
select distinct o.group_id, o.course_id, 'migración desde la oferta'
  from semester_offerings o
 where o.group_id is not null and o.course_id is not null
on conflict (group_id, course_id) do nothing;

select
  (select count(*) from academic_group_courses)                            as asignaturas_de_carrusel,
  (select count(distinct group_id) from academic_group_courses)            as carruseles_con_asignaturas,
  (select count(*) from academic_groups)                                   as carruseles,
  (select count(*) from semester_offerings where group_id is not null)     as ofertas_que_las_daban;
