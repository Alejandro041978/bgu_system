-- ===========================================================================
-- Un correo no puede ser de estudiante y de colaborador a la vez
--
-- Regla del usuario (2026-08-04): cada rol usa su propio correo. El estudiante
-- entra con su @blackwell.pro —o su correo personal en los programas DCE— y el
-- colaborador con el de trabajo: @blackwell.university, @neumann.education,
-- @balticec.com y otros.
--
-- No es una preferencia de forma. El ERP decide QUIÉN eres por tu correo, así
-- que un correo compartido vuelve ambigua la respuesta: diez colaboradores
-- —incluido el único superadmin— tenían su correo de trabajo cargado también
-- en su ficha de estudiante, y el sistema los leyó como alumnos y les cerró el
-- ERP.
--
-- Va como trigger y no solo como validación en las pantallas porque los datos
-- entran por más puertas: la importación de SystemActiva, N8N, y cualquier
-- carga futura. Una regla que solo vive en el formulario no es una regla.
-- ===========================================================================

create or replace function verificar_correo_unico_rol() returns trigger
language plpgsql as $$
declare
  duenio text;
begin
  if tg_table_name = 'academic_students' then
    -- Los dos correos del estudiante se comprueban contra el personal.
    select e.full_name into duenio
      from hr_employees e
     where lower(trim(e.email)) in (lower(trim(coalesce(new.email, ''))), lower(trim(coalesce(new.email_alt, ''))))
       and coalesce(trim(e.email), '') <> ''
     limit 1;
    if duenio is not null then
      raise exception 'El correo ya pertenece al colaborador "%". Un estudiante y un colaborador no pueden compartir correo: el sistema decide quién eres por él.', duenio
        using errcode = '23505';
    end if;

  else  -- hr_employees
    select s.first_name || ' ' || coalesce(s.last_name, '') into duenio
      from academic_students s
     where lower(trim(coalesce(new.email, ''))) <> ''
       and lower(trim(new.email)) in (lower(trim(coalesce(s.email, ''))), lower(trim(coalesce(s.email_alt, ''))))
     limit 1;
    if duenio is not null then
      raise exception 'El correo ya pertenece al estudiante "%". Un colaborador debe usar su correo de trabajo.', duenio
        using errcode = '23505';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_correo_unico_estudiante on academic_students;
create trigger trg_correo_unico_estudiante
  before insert or update of email, email_alt on academic_students
  for each row execute function verificar_correo_unico_rol();

drop trigger if exists trg_correo_unico_colaborador on hr_employees;
create trigger trg_correo_unico_colaborador
  before insert or update of email on hr_employees
  for each row execute function verificar_correo_unico_rol();


-- ── Verificación ──────────────────────────────────────────────────────────
-- Debe devolver 0: si devuelve algo, esos choques hay que resolverlos a mano
-- antes de que el trigger empiece a rechazar ediciones sobre ellos.
select count(*)::text as "choques restantes"
  from academic_students s
  join hr_employees e
    on coalesce(trim(e.email), '') <> ''
   and lower(trim(e.email)) in (lower(trim(coalesce(s.email, ''))), lower(trim(coalesce(s.email_alt, ''))));
