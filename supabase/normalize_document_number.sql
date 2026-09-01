-- Candado de documento canónico (regla del 31-08-2026): el documento de un
-- estudiante solo admite letras y números. Este trigger normaliza en la BASE,
-- así que atrapa también lo que no pasa por el ERP (N8N, SQL directo).
--
-- Nota: normaliza el VALOR que entra; NO migra tablas dependientes. Cambiar el
-- documento de un estudiante existente sigue exigiendo migrar sus notas,
-- matrículas y auditoría a la vez (lección Castillo: corregirlo en una sola
-- tabla parte el expediente en dos).
--
-- Correr en el editor SQL de Supabase. Verificación al final.

create or replace function public.normalize_student_document()
returns trigger
language plpgsql
as $$
begin
  if new.document_number is not null then
    new.document_number := regexp_replace(new.document_number, '[^0-9A-Za-z]', '', 'g');
    if new.document_number = '' then
      raise exception 'El documento debe tener al menos una letra o número';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_student_document on public.academic_students;
create trigger trg_normalize_student_document
  before insert or update of document_number on public.academic_students
  for each row execute function public.normalize_student_document();

-- Verificación: debe devolver una sola fila ('71741729-' de Ccahuana, la
-- colisión pendiente de Registros; el trigger solo actúa sobre escrituras
-- nuevas, no reescribe lo existente).
select document_number, first_name, last_name
from public.academic_students
where document_number ~ '[^0-9A-Za-z]';
