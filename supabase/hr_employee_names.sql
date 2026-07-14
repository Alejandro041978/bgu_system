-- ============================================================================
-- Separar el nombre del colaborador en dos campos: first_names (nombres) y
-- last_names (apellidos). Se mantiene full_name sincronizado para no romper las
-- vistas existentes. El backfill es heurístico (últimas 2 palabras = apellidos);
-- corregir a mano los casos con apellidos compuestos.
-- Ejecutar en Supabase.
-- ============================================================================
alter table hr_employees add column if not exists first_names text;
alter table hr_employees add column if not exists last_names  text;

with parts as (
  select id, regexp_split_to_array(btrim(full_name), '\s+') as toks
  from hr_employees
  where coalesce(btrim(full_name), '') <> ''
)
update hr_employees e set
  last_names = case
    when array_length(p.toks, 1) >= 3 then array_to_string(p.toks[array_length(p.toks,1)-1 : array_length(p.toks,1)], ' ')
    when array_length(p.toks, 1) = 2 then p.toks[2]
    else '' end,
  first_names = case
    when array_length(p.toks, 1) >= 3 then array_to_string(p.toks[1 : array_length(p.toks,1)-2], ' ')
    else p.toks[1] end
from parts p
where e.id = p.id
  and (e.first_names is null and e.last_names is null);
