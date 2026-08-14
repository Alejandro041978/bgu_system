-- ---------------------------------------------------------------------------
-- Paso 1 de mover el registro curricular a su propia tabla.
--
-- QUÉ SE ARREGLA
-- academic_course_enrollments existe desde el 31 de julio y tiene la forma
-- correcta —una fila por estudiante × asignatura × intento—, pero hoy es una
-- foto: se construyó una vez a partir de las notas, no la mantiene ningún cron
-- y ya lleva dos semanas de desfase. Le faltan 4.175 pares que sí están en
-- notas y conserva 842 que ya no existen.
--
-- Y le faltan dos cosas para poder ser la fuente:
--
--   1. EL PERIODO. Hoy guarda term_year y term_block, que son los campos de
--      SystemActiva que estamos sacando del ERP. Necesita semester_id, que es
--      como se nombra un periodo aquí.
--
--   2. LAS ASIGNATURAS NO EMPEZADAS. Son 4.111 y hoy viven en la tabla de
--      NOTAS como filas de plan, sin nota, sin aula y sin periodo. Ahí es
--      donde no deben estar: una asignatura que nadie ha cursado no es una
--      calificación. En el registro sí, porque el registro es lo que el
--      estudiante tiene inscrito.
--
-- QUÉ NO CAMBIA TODAVÍA
-- Nada lee esta tabla salvo tres archivos, y ninguno de ellos decide nada que
-- se vea. Este paso no toca el acta, ni el precio, ni el importador: solo deja
-- el registro completo, fechado y mantenido, para poder comprobar durante unas
-- semanas si aguanta como fuente antes de mover a nadie a leerlo.
--
-- Las filas de plan siguen donde están. Se borrarán en el paso 3, cuando el
-- acta ya lea de aquí.
-- ---------------------------------------------------------------------------

-- El periodo, con la nomenclatura del ERP.
alter table academic_course_enrollments
  add column if not exists semester_id uuid references academic_semesters(id);

create index if not exists ace_semester_idx on academic_course_enrollments (semester_id);
create index if not exists ace_student_course_idx on academic_course_enrollments (student_id, course_id, attempt);
create index if not exists ace_status_idx on academic_course_enrollments (status);

-- 'no_iniciada' es un estado nuevo: la asignatura está en su registro y no ha
-- empezado. Es lo que hoy significa una fila de plan.
--
-- Si status tiene un CHECK que enumera los valores, hay que ampliarlo. Se hace
-- por catálogo y no a ciegas: primero mira qué restricción existe.
do $$
declare
  con text;
begin
  select conname into con
    from pg_constraint
   where conrelid = 'academic_course_enrollments'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';
  if con is not null then
    execute format('alter table academic_course_enrollments drop constraint %I', con);
  end if;
end $$;

alter table academic_course_enrollments
  add constraint academic_course_enrollments_status_chk
  check (status in ('no_iniciada', 'en_curso', 'aprobada', 'reprobada', 'retirada'));

-- Trazabilidad: de dónde salió cada fila del registro.
comment on column academic_course_enrollments.semester_id is
  'Periodo del ERP en que se cursa este intento. Sustituye a term_year/term_block, que son de SystemActiva.';
comment on column academic_course_enrollments.status is
  'no_iniciada = inscrita y sin empezar (lo que hoy es una fila de plan en academic_grades).';

-- El registro se consulta, no se corrige a mano.
alter table academic_course_enrollments enable row level security;
revoke all on academic_course_enrollments from anon, authenticated;
grant select, insert, update, delete on academic_course_enrollments to service_role;
