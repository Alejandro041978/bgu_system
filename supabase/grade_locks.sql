-- Cierre de actas: una nota bloqueada (locked_at) no puede ser tocada por
-- NINGUNA importación (Moodle, CSV, sync de N8N). Protege contra las aulas
-- Moodle que se limpian para reutilizarlas con otra cohorte: lo que ya está
-- en el ERP no se vacía ni se altera por una reimportación.
--
-- El editor manual SÍ puede corregir una nota cerrada (escribe edited_at
-- nuevo y queda auditado). Cerrar/reabrir el acta escribe locked_at, que
-- también pasa el trigger.
alter table academic_grades add column if not exists locked_at timestamptz;

create or replace function protect_edited_grades() returns trigger as $$
begin
  if (old.edited_at is not null or old.locked_at is not null)
     and new.edited_at is not distinct from old.edited_at
     and new.locked_at is not distinct from old.locked_at then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists protect_edited_grades_trg on academic_grades;
create trigger protect_edited_grades_trg
  before update on academic_grades
  for each row execute function protect_edited_grades();
