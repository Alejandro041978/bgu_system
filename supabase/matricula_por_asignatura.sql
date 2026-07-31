-- ===========================================================================
-- Matrícula por asignatura
--
-- La pieza que falta en el modelo. Hasta ahora la matrícula del ERP era por
-- PROGRAMA (academic_student_enrollments) y la matrícula en una asignatura era
-- un efecto secundario de la nota: SystemActiva creaba una fila en
-- academic_grades, con nota o vacía, y el periodo quedaba en term_year.
--
-- De ahí salen tres problemas que no se pueden resolver por separado:
--
--   · No hay padrón. "Un estudiante matriculado en el ERP debe existir en el
--     aula virtual" es incomprobable si el ERP no sabe qué asignaturas lleva.
--   · No hay segunda matrícula. La política es que una asignatura con nota de
--     SystemActiva no admite notas nuevas, salvo que el estudiante la lleve por
--     segunda vez — pero ese "por segunda vez" no existía como acto.
--   · El periodo de la nota salía de la oferta formativa. Al colgar el aula del
--     plan de estudios (y no de la oferta), hacía falta otro lugar de donde
--     leerlo. El correcto es este: el periodo es del paso del estudiante por la
--     asignatura, no del aula, que se reutiliza entre cohortes.
--
-- Una fila = un intento de un estudiante en una asignatura del plan.
-- ===========================================================================

create table if not exists academic_course_enrollments (
  id                     uuid primary key default gen_random_uuid(),

  student_id             uuid not null references academic_students(id) on delete cascade,
  -- Espejo del documento: las notas y el import de Moodle trabajan por
  -- document_number, no por id. Se guarda para no obligar a un join en el
  -- camino caliente del import.
  document_number        text,

  course_id              uuid not null references academic_courses(id),
  program_id             uuid references academic_programs(id),
  program_enrollment_id  uuid references academic_student_enrollments(id),

  -- 1 = primera vez. 2+ = la lleva de nuevo, y es lo ÚNICO que autoriza a
  -- Moodle a escribir sobre una asignatura que ya tiene nota de SystemActiva.
  attempt                smallint not null default 1,

  term_year              integer,
  term_block             text,

  -- en_curso | aprobada | reprobada | retirada
  status                 text not null default 'en_curso',
  -- de dónde nació: systemactiva (reconstruida) | erp (acto administrativo)
  -- | grupo (colocación) | moodle
  source                 text not null default 'erp',

  opened_at              timestamptz not null default now(),
  opened_by              text,
  closed_at              timestamptz,
  created_at             timestamptz not null default now(),

  constraint academic_course_enrollments_intento_unico
    unique (student_id, course_id, attempt)
);

create index if not exists idx_ace_student   on academic_course_enrollments (student_id);
create index if not exists idx_ace_doc       on academic_course_enrollments (document_number);
create index if not exists idx_ace_course    on academic_course_enrollments (course_id);
create index if not exists idx_ace_doc_curso on academic_course_enrollments (document_number, course_id);

-- El esquema está cerrado: todo el acceso es por service_role desde las rutas
-- del ERP, que son las que autorizan. Sin políticas: los estudiantes tienen
-- sesión de Supabase y una política para `authenticated` los dejaría entrar.
alter table academic_course_enrollments enable row level security;

-- "Exponer tablas nuevas automáticamente" está apagado.
grant all on table academic_course_enrollments to service_role;


-- ── El puente desde la nota ────────────────────────────────────────────────
-- Hasta ahora una nota decía a qué asignatura pertenece con DOS TEXTOS
-- (course_code, course_name) y todo el ERP volvía a emparejar por nombre en
-- cada consulta. El código no sirve de llave: "101" es el código de 54
-- asignaturas distintas y "102" de 52. Con estas dos columnas el
-- emparejamiento se hace UNA vez y queda escrito.
--
-- Se dejan nullable a propósito: el 1,1% de las notas que no resuelven a una
-- asignatura (nombres que no existen en ninguna malla) tiene que poder seguir
-- existiendo y verse como pendiente, no romper la carga.
alter table academic_grades
  add column if not exists course_id            uuid references academic_courses(id),
  add column if not exists course_enrollment_id uuid references academic_course_enrollments(id);

create index if not exists idx_grades_course_id on academic_grades (course_id);
create index if not exists idx_grades_ace       on academic_grades (course_enrollment_id);


-- ── Verificación ───────────────────────────────────────────────────────────
select
  (select count(*) from academic_course_enrollments) as matriculas_por_asignatura,
  (select count(*) from academic_grades where course_id is null) as notas_sin_asignatura_resuelta;
