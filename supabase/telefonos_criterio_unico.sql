-- ===========================================================================
-- Un solo criterio de teléfono en todo el ERP
--
--   phone_code   '+51'        lo edita una persona
--   phone_local  '948009908'  lo edita una persona, SIN código de país
--   phone_number '+51948009908'  DERIVADO. Nunca se escribe a mano.
--
-- Nadie compone: quien necesite marcar lee phone_number y punto. Componer a
-- mano fue lo que dejó a Camila una semana sin entregar un mensaje —el motor
-- nuevo hacía phone_code || phone_number y salía '+51+51948009908', que Twilio
-- rechaza con el error 21211—, mientras el motor de retención, que leía
-- phone_number solo, funcionaba sin un fallo.
--
-- El derivado lo mantiene un TRIGGER, no la disciplina de cada ruta. Doce
-- rutas acordándose de recomponer es doce oportunidades de olvidarlo; una
-- regla en la base es una.
-- ===========================================================================

-- ── El derivado ────────────────────────────────────────────────────────────
create or replace function erp_e164(p_code text, p_local text)
returns text
language sql
immutable
as $$
  select case
    when p_code is null or p_local is null then null
    when regexp_replace(p_code, '\D', '', 'g') = '' then null
    when regexp_replace(p_local, '\D', '', 'g') = '' then null
    else '+' || regexp_replace(p_code, '\D', '', 'g') || regexp_replace(p_local, '\D', '', 'g')
  end
$$;

-- Recalcula el canónico SOLO cuando hay partes.
--
-- Sin partes se deja intacto lo que hubiera: hay 28 estudiantes cuyo
-- phone_number es basura heredada de Activa ('583030', '&nbsp;', fragmentos de
-- fijos) y sin código ni local que lo expliquen. Vaciarlos aquí sería perder
-- el único rastro del dato mientras alguien decide qué hacer con ellos.
create or replace function erp_sync_phone_number()
returns trigger
language plpgsql
as $$
begin
  if new.phone_code is not null and new.phone_local is not null then
    new.phone_number := erp_e164(new.phone_code, new.phone_local);
  end if;
  return new;
end
$$;

-- ── Estudiantes: ya cumplen (1.584 coherentes, 0 incoherentes) ─────────────
-- Solo se les pone el guardián para que no puedan dejar de cumplir.
drop trigger if exists trg_students_phone on academic_students;
create trigger trg_students_phone
  before insert or update of phone_code, phone_local, phone_number
  on academic_students
  for each row execute function erp_sync_phone_number();

-- ── Colaboradores ──────────────────────────────────────────────────────────
-- Guardaban un solo campo `phone` de texto con la forma '+51 999327233'. Se
-- parte por el espacio, que es como la propia ficha lo venía componiendo.
alter table hr_employees add column if not exists phone_code  text;
alter table hr_employees add column if not exists phone_local text;
alter table hr_employees add column if not exists phone_number text;

update hr_employees
   set phone_code  = split_part(phone, ' ', 1),
       phone_local = regexp_replace(substr(phone, position(' ' in phone) + 1), '\D', '', 'g')
 where phone is not null
   and phone like '+%'
   and position(' ' in phone) > 0
   and phone_local is null;

-- Sin espacio: se reconoce el prefijo más largo que encaje.
with codigos(c) as (values
  ('+593'),('+595'),('+598'),('+591'),('+502'),('+503'),('+504'),('+505'),
  ('+506'),('+507'),('+509'),('+51'),('+52'),('+53'),('+54'),('+55'),('+56'),
  ('+57'),('+58'),('+34'),('+39'),('+33'),('+49'),('+44'),('+1')
)
update hr_employees e
   set phone_code  = m.c,
       phone_local = regexp_replace(substr(e.phone, length(m.c) + 1), '\D', '', 'g')
  from (
    select e2.id, (select c from codigos where e2.phone like c || '%' order by length(c) desc limit 1) as c
      from hr_employees e2
     where e2.phone like '+%' and position(' ' in e2.phone) = 0 and e2.phone_local is null
  ) m
 where e.id = m.id and m.c is not null;

update hr_employees set phone_number = erp_e164(phone_code, phone_local)
 where phone_code is not null and phone_local is not null;

-- `phone` pasa a ser el canónico, para no romper lo que aún lo lee.
update hr_employees set phone = phone_number where phone_number is not null;

create or replace function erp_sync_phone_employee()
returns trigger
language plpgsql
as $$
begin
  if new.phone_code is not null and new.phone_local is not null then
    new.phone_number := erp_e164(new.phone_code, new.phone_local);
    new.phone := new.phone_number;
  end if;
  return new;
end
$$;

drop trigger if exists trg_employees_phone on hr_employees;
create trigger trg_employees_phone
  before insert or update of phone_code, phone_local, phone_number, phone
  on hr_employees
  for each row execute function erp_sync_phone_employee();

-- ── Leads ──────────────────────────────────────────────────────────────────
-- OJO: en sales_leads la columna `phone` NO es un teléfono, es la CLAVE de la
-- conversación —puede valer 'web:abc123'— y forma parte del índice único
-- (phone, bot_key). No se toca. El teléfono real vivía escondido en
-- meta.real_phone; ahora tiene sus propias columnas, con el mismo criterio que
-- el resto del ERP.
alter table sales_leads add column if not exists phone_code   text;
alter table sales_leads add column if not exists phone_local  text;
alter table sales_leads add column if not exists phone_number text;

with codigos(c) as (values
  ('+593'),('+595'),('+598'),('+591'),('+502'),('+503'),('+504'),('+505'),
  ('+506'),('+507'),('+509'),('+51'),('+52'),('+53'),('+54'),('+55'),('+56'),
  ('+57'),('+58'),('+34'),('+39'),('+33'),('+49'),('+44'),('+1')
),
origen as (
  select id,
         coalesce(nullif(meta->>'real_phone', ''), case when phone like '+%' then phone end) as tel
    from sales_leads
)
update sales_leads l
   set phone_code  = m.c,
       phone_local = regexp_replace(substr(m.tel, length(m.c) + 1), '\D', '', 'g')
  from (
    select o.id, o.tel, (select c from codigos where o.tel like c || '%' order by length(c) desc limit 1) as c
      from origen o where o.tel is not null
  ) m
 where l.id = m.id and m.c is not null and l.phone_local is null;

update sales_leads set phone_number = erp_e164(phone_code, phone_local)
 where phone_code is not null and phone_local is not null;

drop trigger if exists trg_leads_phone on sales_leads;
create trigger trg_leads_phone
  before insert or update of phone_code, phone_local, phone_number
  on sales_leads
  for each row execute function erp_sync_phone_number();

-- ── Verificación ───────────────────────────────────────────────────────────
select 'estudiantes incoherentes (debe ser 0)' as control, count(*)::text as valor
  from academic_students
 where phone_code is not null and phone_local is not null
   and phone_number is distinct from erp_e164(phone_code, phone_local)
union all
select 'colaboradores con teléfono partido', count(*)::text
  from hr_employees where phone_local is not null
union all
select 'colaboradores con teléfono SIN partir (revisar)', count(*)::text
  from hr_employees where phone is not null and phone_local is null
union all
select 'leads con teléfono real identificado', count(*)::text
  from sales_leads where phone_number is not null;

grant all on table hr_employees to service_role;
grant all on table sales_leads to service_role;
