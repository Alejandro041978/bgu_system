-- ============================================================================
-- FASE 1 de la migración documento → uuid (autorizada 31-08-2026)
-- Agrega student_id a academic_grades y grade_audit, con backfill verificado.
-- NO cambia ningún comportamiento: es el cimiento para que los escritores
-- (fase 2) y los lectores (fase 3) dejen de asociar por documento.
-- Correr en el editor SQL de Supabase, de arriba hacia abajo.
-- ============================================================================

-- PASO 0 · precondición: cero documentos duplicados en estudiantes.
-- DEBE devolver 0 filas; si devuelve algo, DETENERSE y avisar.
select document_number, count(*)
from public.academic_students
group by document_number having count(*) > 1;

-- PASO 1 · columnas (uuid, nulas mientras dura la transición)
alter table public.academic_grades add column if not exists student_id uuid;
alter table public.grade_audit    add column if not exists student_id uuid;

-- PASO 2 · backfill por documento (hoy es unívoco: 2.004 = 2.004)
update public.academic_grades g
set student_id = s.id
from public.academic_students s
where g.student_id is null
  and s.document_number = g.document_number;

update public.grade_audit a
set student_id = s.id
from public.academic_students s
where a.student_id is null
  and s.document_number = a.document_number;

-- PASO 3 · llaves foráneas.
--  · notas: RESTRICT — no se puede borrar un estudiante con notas (protege el
--    expediente, igual que el candado de exam_requests).
--  · auditoría: SET NULL — el historial no debe impedir nada.
alter table public.academic_grades
  drop constraint if exists academic_grades_student_id_fkey;
alter table public.academic_grades
  add constraint academic_grades_student_id_fkey
  foreign key (student_id) references public.academic_students(id) on delete restrict;

alter table public.grade_audit
  drop constraint if exists grade_audit_student_id_fkey;
alter table public.grade_audit
  add constraint grade_audit_student_id_fkey
  foreign key (student_id) references public.academic_students(id) on delete set null;

create index if not exists idx_academic_grades_student_id on public.academic_grades(student_id);
create index if not exists idx_grade_audit_student_id on public.grade_audit(student_id);

-- PASO 4 · puente hasta la fase 2: las filas nuevas que lleguen sin student_id
-- (el importador aún no lo escribe) lo resuelven desde el documento al entrar.
-- Cuando la fase 2 despliegue escritores por uuid, este trigger queda como red
-- de seguridad y no estorba.
create or replace function public.fill_student_id_from_document()
returns trigger
language plpgsql
as $$
begin
  if new.student_id is null and new.document_number is not null then
    select id into new.student_id
    from public.academic_students
    where document_number = new.document_number;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_student_id on public.academic_grades;
create trigger trg_fill_student_id
  before insert or update of document_number on public.academic_grades
  for each row execute function public.fill_student_id_from_document();

drop trigger if exists trg_fill_student_id_audit on public.grade_audit;
create trigger trg_fill_student_id_audit
  before insert on public.grade_audit
  for each row execute function public.fill_student_id_from_document();

-- ============================================================================
-- VERIFICACIÓN (pegar los resultados de estas tres consultas)
-- ============================================================================

-- V1 · cobertura del backfill. Esperado: sin_uuid = 0 en notas (el barrido del
-- 31-08 encontró 0 notas huérfanas); en auditoría puede haber residuo de
-- documentos históricos que ya no existen — se reporta, no bloquea.
select 'academic_grades' as tabla,
  count(*) as total,
  count(*) filter (where student_id is null) as sin_uuid
from public.academic_grades
union all
select 'grade_audit', count(*), count(*) filter (where student_id is null)
from public.grade_audit;

-- V2 · coherencia: el documento de la nota debe ser el del estudiante enlazado.
-- Esperado: 0.
select count(*) as incoherentes
from public.academic_grades g
join public.academic_students s on s.id = g.student_id
where s.document_number <> g.document_number;

-- V3 · coherencia triangular: la matrícula enlazada debe ser del mismo
-- estudiante. Esperado: 0.
select count(*) as nota_y_matricula_de_distinto_estudiante
from public.academic_grades g
join public.academic_course_enrollments m on m.id = g.course_enrollment_id
where g.student_id is not null
  and m.student_id <> g.student_id;
