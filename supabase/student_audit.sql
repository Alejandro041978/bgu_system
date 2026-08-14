-- ---------------------------------------------------------------------------
-- Registro de cambios en las fichas de estudiantes.
--
-- Nace de un caso real (14-08-2026): el correo de dos fichas había cambiado y
-- no había forma de saber quién ni cuándo. Uno de los dos cambios fue de
-- Dirección, deliberado, para cerrarle el paso a una cuenta; el otro sigue sin
-- explicación. Sin registro, la única respuesta posible era "no se sabe".
--
-- Se hace en la BASE y no en la aplicación a propósito. Diecisiete lugares del
-- código escriben en academic_students, y además escriben N8N, la consola de
-- Supabase y cualquier SQL corrido a mano — que es justo por donde entran los
-- cambios que nadie recuerda haber hecho. Un disparador no se puede esquivar.
--
-- Una fila por CAMPO cambiado, igual que grade_audit: leer "email: X → Y" es
-- inmediato, y un diff de la fila entera no lo es.
-- ---------------------------------------------------------------------------

-- Quién lo hizo. La aplicación lo escribe en cada update; lo que llegue por
-- fuera lo deja en NULL y el registro lo marca como externo, que ya es una
-- respuesta útil ("no salió del ERP").
alter table academic_students add column if not exists updated_by uuid;

create table if not exists student_audit (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null,
  document_number text,
  student_name    text,
  field           text not null,          -- '*' en alta y baja
  old_value       text,
  new_value       text,
  action          text not null default 'update',   -- insert | update | delete
  changed_by      uuid,                   -- auth.users.id, si vino del ERP
  changed_by_email text,
  db_role         text,                   -- rol de base que ejecutó
  changed_at      timestamptz not null default now()
);

create index if not exists student_audit_student_idx on student_audit (student_id, changed_at desc);
create index if not exists student_audit_at_idx      on student_audit (changed_at desc);
create index if not exists student_audit_field_idx   on student_audit (field, changed_at desc);

-- Campos que cambian solos y no dicen nada de nadie. Registrarlos ahogaría el
-- resto: synced_at se mueve en cada pasada del sincronizador.
create or replace function student_audit_ignora(campo text) returns boolean as $$
  select campo in ('updated_by', 'synced_at');
$$ language sql immutable;

create or replace function log_student_changes() returns trigger
language plpgsql
security definer            -- para poder leer auth.users y resolver el correo
set search_path = public, auth
as $$
declare
  campo   text;
  nuevo   text;
  viejo   text;
  actor   uuid;
  correo  text;
begin
  if TG_OP = 'INSERT' then
    insert into student_audit (student_id, document_number, student_name, field, action, changed_by, db_role)
    values (NEW.id, NEW.document_number,
            concat_ws(' ', NEW.first_name, NEW.last_name, NEW.second_last_name),
            '*', 'insert', NEW.updated_by, current_user);
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    insert into student_audit (student_id, document_number, student_name, field, action, db_role)
    values (OLD.id, OLD.document_number,
            concat_ws(' ', OLD.first_name, OLD.last_name, OLD.second_last_name),
            '*', 'delete', current_user);
    return OLD;
  end if;

  actor := NEW.updated_by;
  if actor is not null then
    begin
      select u.email into correo from auth.users u where u.id = actor;
    exception when others then
      correo := null;   -- sin permiso para leer auth: queda el uuid, que basta
    end;
  end if;

  for campo, nuevo in select key, value from jsonb_each_text(to_jsonb(NEW)) loop
    if student_audit_ignora(campo) then continue; end if;
    viejo := to_jsonb(OLD) ->> campo;
    if viejo is distinct from nuevo then
      insert into student_audit (student_id, document_number, student_name, field,
                                 old_value, new_value, action, changed_by, changed_by_email, db_role)
      values (NEW.id, NEW.document_number,
              concat_ws(' ', NEW.first_name, NEW.last_name, NEW.second_last_name),
              campo, viejo, nuevo, 'update', actor, correo, current_user);
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists log_student_changes_trg on academic_students;
create trigger log_student_changes_trg
  after insert or update or delete on academic_students
  for each row execute function log_student_changes();

-- El registro es de solo lectura para todos: se consulta, no se corrige. Si
-- alguien pudiera editarlo, no serviría para lo que existe.
alter table student_audit enable row level security;
revoke all on student_audit from anon, authenticated;
grant select, insert on student_audit to service_role;

-- El grant es lo que faltó cuando se creó app_superadmins y dejó al ERP sin
-- ningún superadministrador. Aquí el síntoma sería distinto y más callado: los
-- cambios seguirían guardándose y el historial saldría vacío.
grant usage on schema public to service_role;
