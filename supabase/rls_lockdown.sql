-- ===========================================================================
-- CIERRE DE LA API PÚBLICA (RLS en todo el esquema public)
--
-- Contexto: la `anon key` viaja en el navegador y cualquiera puede usarla. Lo
-- único que protege una tabla en Supabase es RLS. Auditado el 2026-07-29: 29
-- tablas sin RLS quedaban legibles por cualquiera (39,411 filas, incluidos
-- 1,971 estudiantes con documento de identidad y 26,144 tickets).
--
-- Modelo de seguridad del ERP: TODO el acceso a datos va por la clave de
-- SERVICIO desde rutas del servidor (259 archivos), y la autorización la hacen
-- las rutas (requireStaff / isStudentUser) y el middleware por rol.
-- La clave de servicio IGNORA RLS por diseño → activar RLS no rompe el ERP.
--
-- NO se crean políticas para `authenticated` a propósito: los ESTUDIANTES
-- también tienen sesión Supabase; una política así les daría acceso directo a
-- tickets, retiros y notas de todos.
--
-- Ejecutar en Supabase (SQL Editor). Idempotente.
-- ===========================================================================

-- 1) RLS en todas las TABLAS del esquema public (sin políticas = nadie entra
--    por la API pública; la clave de servicio sigue pasando).
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end $$;

-- 2) VISTAS: no obedecen RLS como las tablas — se ejecutan con los permisos de
--    su DUEÑO, así que una vista sobre una tabla protegida la seguiría
--    filtrando (caso hr_employees_with_status: 107 empleados expuestos).
--    security_invoker las hace respetar los permisos de QUIEN consulta.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = on)', r.relname);
  end loop;
end $$;

-- 3) Revocar el acceso de los roles públicos al esquema (cinturón y tirantes:
--    aunque mañana alguien cree una tabla y olvide RLS, no queda expuesta).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICACIÓN (correr después; ambas deben devolver 0 filas)
-- ---------------------------------------------------------------------------
-- Tablas sin RLS:
--   select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
--
-- Vistas sin security_invoker:
--   select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relkind='v'
--     and coalesce((select option_value from pg_options_to_table(c.reloptions)
--                   where option_name='security_invoker'), 'false') <> 'true';
