-- ---------------------------------------------------------------------------
-- Los documentos de postulación dejan de ser los mismos para todo el mundo.
--
-- Los 6 tipos actuales se piden a cualquier postulante, sea de un máster o de
-- un curso de actualización de tres meses. Dirección define ocho documentos más
-- —formularios de admisión, cartas de decisión, acuerdos de matrícula— que
-- corresponden a Bachelor, Master y Doctorado, y solo a ellos.
--
-- Sin acotar por categoría, esas ocho columnas aparecerían también en las
-- convocatorias de Educación Continua: catorce botones "Subir" de los que ocho
-- no van, y un avance que nunca llegaría a completo. Una casilla que nadie debe
-- llenar enseña a ignorar la fila entera.
--
-- `category_ids` en null (o vacío) significa "para todas": así los 6 tipos que
-- ya existen siguen comportándose igual sin tocarlos.
-- ---------------------------------------------------------------------------

alter table public.admission_doc_types
  add column if not exists category_ids uuid[];

comment on column public.admission_doc_types.category_ids is
  'Categorías de programa a las que se pide este documento. Null o vacío = a todas.';

-- Los ocho nuevos, para Bachelor, Master y Doctorado.
--
-- Se insertan con los nombres tal como los dio Dirección, en inglés: son
-- documentos con nombre propio —FERPA Waiver Form, Enrollment Agreement— y
-- traducirlos los volvería imposibles de reconocer cuando llegan firmados.
insert into public.admission_doc_types (name, sort_order, active, category_ids)
select v.name, v.sort_order, true, (
  select array_agg(id) from public.academic_programs_category
   where name in ('Bachelor Program', 'Master Program', 'Doctoral Program')
)
from (values
  ('Admission Application Form',              11),
  ('Admission Decision Letter - Conditional', 12),
  ('Student Admissions Acceptance - Regular', 13),
  ('Grant/Scholarship Letter',                14),
  ('Enrollment Agreement',                    15),
  ('Grant Application Form',                  16),
  ('Update Financial Letter',                 17),
  ('FERPA Waiver Form',                       18)
) as v(name, sort_order)
where not exists (
  select 1 from public.admission_doc_types t where t.name = v.name
);

-- Verificación: los 6 de siempre sin categoría (= todas) y los 8 nuevos con tres.
select name, sort_order, coalesce(array_length(category_ids, 1), 0) as categorias
  from public.admission_doc_types
 where active
 order by sort_order;
