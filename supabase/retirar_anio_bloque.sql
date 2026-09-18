-- ---------------------------------------------------------------------------
-- Retiro de AÑO + BLOQUE (term_year / term_block) de las calificaciones.
-- Autorizado por el usuario el 18/09/2026.
--
-- Eran el dato crudo de SystemActiva: se contradecían entre sí en miles de
-- filas y partían el historial en periodos que nadie cursó. El periodo de una
-- nota es su SEMESTRE (semester_id). El código dejó de leerlos y escribirlos en
-- el despliegue previo (fase 1); el acta detallada que llega de N8N traduce el
-- periodo de Activa al semestre en la puerta.
--
-- Se retiran de TRES tablas: academic_grades, academic_grade_details y
-- academic_course_enrollments.
-- NO se tocan: convocatorias (año + bloque es la identidad del llamado) ni
-- academic_student_enrollments.term_year (año de cohorte de los documentos).
--
-- Respaldo previo: NO_CORRER_respaldo_anio_bloque.json (en el repositorio).
-- Todo va en UNA transacción: si algo depende de esas columnas de una forma no
-- prevista (una vista, otra función), falla entero y no cambia nada.
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------
begin;

-- 1. Funciones que congelan esas columnas (el trigger protect_edited_grades
--    hace new.term_year := old.term_year). Se redefinen SIN esas líneas, a
--    partir de su definición vigente — sea cual sea la versión instalada.
do $$
declare
  r record;
  def text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ~ 'term_(year|block)'
  loop
    def := pg_get_functiondef(r.oid);
    -- quita las líneas de asignación  new.term_year := old.term_year;
    def := regexp_replace(def, '^[^\n]*new\.term_(year|block)[^\n]*\n', '', 'gn');
    if def ~ 'term_(year|block)' then
      raise exception 'La función % usa term_year/term_block de una forma no prevista: revisar antes de borrar las columnas', r.proname;
    end if;
    execute def;
    raise notice 'Función % redefinida sin año/bloque', r.proname;
  end loop;
end $$;

-- 2. Vistas que dependen de esas columnas.
--    v_copias_activa es una vista de DIAGNÓSTICO del 31/07/2026 (la limpieza de
--    las 14 copias de Activa): ningún código la usa y se elimina. Si hubiera
--    CUALQUIER otra, se detiene y las nombra todas de una vez.
drop view if exists v_copias_activa;

do $
declare
  otras text;
begin
  select string_agg(distinct c.relname, ', ')
    into otras
    from pg_depend d
    join pg_rewrite r   on r.oid = d.objid
    join pg_class c     on c.oid = r.ev_class
    join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
   where d.refobjid in ('academic_grades'::regclass, 'academic_grade_details'::regclass, 'academic_course_enrollments'::regclass)
     and a.attname in ('term_year', 'term_block')
     and c.oid <> d.refobjid;
  if otras is not null then
    raise exception 'Hay vistas que dependen de año/bloque: %. Revisar antes de borrar las columnas.', otras;
  end if;
end $;

-- 3. Las columnas
alter table academic_grades             drop column term_year, drop column term_block;
alter table academic_grade_details      drop column term_year, drop column term_block;
alter table academic_course_enrollments drop column term_year, drop column term_block;

commit;

-- 4. Comprobación (debe devolver 0 filas)
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('academic_grades', 'academic_grade_details', 'academic_course_enrollments')
   and column_name in ('term_year', 'term_block');
