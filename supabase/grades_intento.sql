-- ============================================================================
-- Recursado: el segundo intento de una asignatura desaprobada.
--
-- El ERP no sabía registrarlo. La importación, al encontrar una nota ya puesta,
-- se apartaba —da igual que fuera un 18 reprobado—, así que quien volvía a
-- cursar una asignatura no dejaba rastro en ninguna parte.
--
-- Se descubrió con tres estudiantes de Accounting que estaban cursando otra vez
-- Interpersonal Communication: sus notas solo existían porque el aula estaba
-- mal identificada y caían en otra asignatura, donde no había fila que las
-- bloqueara. El error nos estaba tapando el hueco.
--
-- Regla académica (usuario, 2026-08-11): se conservan los dos intentos y para
-- el estado de la asignatura MANDA EL MEJOR — que es lo que el acta y el motor
-- de carruseles ya hacían cuando encontraban varias notas.
--
-- Ejecutar en Supabase (idempotente).
-- ============================================================================

alter table academic_grades add column if not exists intento int not null default 1;

comment on column academic_grades.intento is
  '1 = primer intento. 2+ = recursado; se muestra como "Recursado N-1". El acta se queda con el mejor.';

-- Para listar los recursados sin recorrer la tabla entera.
create index if not exists idx_grades_intento on academic_grades (intento) where intento > 1;

select
  (select count(*) from academic_grades where intento > 1) as recursados,
  (select count(*) from academic_grades)                   as notas;
