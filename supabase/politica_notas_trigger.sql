-- ===========================================================================
-- La política de notas, en la base de datos
--
-- Regla: una asignatura que ya tiene nota de SystemActiva no admite notas
-- nuevas de Moodle. La única excepción es que el estudiante la esté llevando
-- por segunda vez — un intento 2 o superior en academic_course_enrollments.
--
-- Por qué acá y no en el importador. Hasta ahora esta regla vivía dentro de
-- resolveImportTarget, la función que lee el historial. El 29 y 30 de julio esa
-- lectura falló y devolvió una lista vacía; como la regla dependía de haber
-- leído bien, dejó de existir y entraron 928 notas sobre asignaturas ya
-- aprobadas. Una regla que se evalúa contra la tabla en el momento del INSERT
-- no se puede desactivar por una consulta fallida, ni por una corrida de
-- emergencia, ni por un flujo de N8N que nadie recuerda.
--
-- Ejecutar DESPUÉS de matricula_por_asignatura.sql y de la reconstrucción.
-- ===========================================================================


-- ── Registro de rechazos ───────────────────────────────────────────────────
-- El trigger no rompe la importación: descarta la fila y la anota. Si abortara
-- la transacción, un solo caso tumbaría el lote de 500 notas del que forma
-- parte y el aula entera se quedaría sin importar. Descartar y dejar rastro
-- mantiene el proceso corriendo y la decisión visible.
create table if not exists grade_policy_rejections (
  id               bigserial primary key,
  document_number  text,
  course_id        uuid,
  course_code      text,
  course_name      text,
  source           text,
  final_grade      numeric,
  moodle_course_id text,
  motivo           text not null,
  rejected_at      timestamptz not null default now()
);

create index if not exists idx_gpr_doc  on grade_policy_rejections (document_number);
create index if not exists idx_gpr_when on grade_policy_rejections (rejected_at desc);

alter table grade_policy_rejections enable row level security;
grant all on table grade_policy_rejections to service_role;


-- ── El trigger ─────────────────────────────────────────────────────────────
create or replace function aplicar_politica_notas() returns trigger
language plpgsql
as $$
declare
  v_intento  smallint;
  v_activa   boolean;
begin
  -- Sólo se juzga lo que llega del campus. Las notas de SystemActiva, las
  -- convalidaciones y las ediciones humanas no pasan por esta puerta.
  if new.source is distinct from 'moodle' then
    return new;
  end if;

  -- Sin asignatura resuelta no hay nada contra qué comparar. Se deja pasar:
  -- rechazar por no saber convertiría cada nombre no emparejado en una nota
  -- perdida en silencio. Estas quedan visibles por course_id null.
  if new.course_id is null then
    return new;
  end if;

  -- ¿La asignatura ya tiene nota de SystemActiva? Una fila de Activa SIN
  -- calificar es una matrícula en curso, no una nota: esa sí se puede rellenar.
  select exists (
    select 1
      from academic_grades g
     where g.course_id = new.course_id
       and g.document_number is not distinct from new.document_number
       and g.source = 'systemactiva'
       and g.external_id is distinct from new.external_id
       and coalesce(g.retake_grade, g.final_grade) is not null
  ) into v_activa;

  if not v_activa then
    return new;
  end if;

  -- Existe nota de Activa. Lo único que autoriza escribir es que esta nota
  -- pertenezca a un segundo intento: el estudiante lleva la asignatura de nuevo.
  select ace.attempt into v_intento
    from academic_course_enrollments ace
   where ace.id = new.course_enrollment_id;

  if coalesce(v_intento, 1) >= 2 then
    return new;
  end if;

  insert into grade_policy_rejections
    (document_number, course_id, course_code, course_name, source, final_grade, moodle_course_id, motivo)
  values
    (new.document_number, new.course_id, new.course_code, new.course_name, new.source,
     coalesce(new.retake_grade, new.final_grade), new.moodle_course_id,
     case when new.course_enrollment_id is null
          then 'La asignatura ya tiene nota de SystemActiva y esta nota no está asociada a ninguna matrícula'
          else 'La asignatura ya tiene nota de SystemActiva y esta matrícula es el primer intento' end);

  -- Descarta la fila sin abortar el lote.
  return null;
end $$;

drop trigger if exists trg_politica_notas on academic_grades;
create trigger trg_politica_notas
  before insert or update on academic_grades
  for each row execute function aplicar_politica_notas();


-- ── Verificación ───────────────────────────────────────────────────────────
-- Debe dar 0: si diera más, la reconstrucción dejó notas de Moodle que la
-- política no admite y hay que revisarlas antes de la próxima importación.
select count(*) as notas_moodle_que_hoy_violan_la_politica
  from academic_grades m
 where m.source = 'moodle'
   and m.course_id is not null
   and exists (
     select 1 from academic_grades h
      where h.course_id = m.course_id
        and h.document_number is not distinct from m.document_number
        and h.source = 'systemactiva'
        and coalesce(h.retake_grade, h.final_grade) is not null)
   and coalesce((select attempt from academic_course_enrollments a
                  where a.id = m.course_enrollment_id), 1) < 2;

-- Y el detalle, para decidir caso por caso si son segundas matrículas
-- legítimas (hay que abrirles el intento 2) o duplicados de la misma cursada.
select m.document_number, m.course_code, m.course_name,
       m.final_grade as nota_moodle, m.moodle_course_id as aula,
       h.final_grade as nota_activa, h.term_year as periodo_activa
  from academic_grades m
  join academic_grades h
    on h.course_id = m.course_id
   and h.document_number is not distinct from m.document_number
   and h.source = 'systemactiva'
   and coalesce(h.retake_grade, h.final_grade) is not null
 where m.source = 'moodle' and m.course_id is not null
   and coalesce((select attempt from academic_course_enrollments a
                  where a.id = m.course_enrollment_id), 1) < 2
 order by m.document_number
 limit 60;


-- ── Reversa ────────────────────────────────────────────────────────────────
-- drop trigger if exists trg_politica_notas on academic_grades;
