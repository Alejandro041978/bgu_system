-- ============================================================================
-- Cierre del 100%: cargar enrollment_date de las 41 matrículas manuales
-- (fechas traídas de SystemActiva por DocumentNumber) y vincularlas a convocatoria
-- por el mismo match por fecha usado en las otras 1954. Ejecutar en Supabase.
-- ============================================================================

begin;

-- 1) Cargar enrollment_date por document_number
with fechas(doc, fecha) as (
  values
  ('00515679',     date '2025-12-22'),
  ('056381535',    date '2024-03-04'),
  ('057200255',    date '2024-01-29'),
  ('059032266',    date '2024-01-29'),
  ('059649267',    date '2023-10-30'),
  ('061102069',    date '2026-01-26'),
  ('08739748',     date '2026-03-02'),
  ('08879583',     date '2024-08-26'),
  ('09865651',     date '2025-01-27'),
  ('1020840720',   date '2023-10-30'),
  ('10791020',     date '2024-09-30'),
  ('10804439',     date '2024-08-26'),
  ('116350374',    date '2024-08-26'),
  ('17804130',     date '2024-08-26'),
  ('18227474',     date '2024-08-26'),
  ('23AE05093',    date '2026-05-25'),
  ('40685109',     date '2024-08-26'),
  ('41254222',     date '2025-05-26'),
  ('41684802',     date '2024-08-26'),
  ('47235806',     date '2024-08-26'),
  ('60441567',     date '2024-01-29'),
  ('62246329',     date '2024-01-29'),
  ('62602988',     date '2024-08-26'),
  ('655173818610', date '2024-07-01'),
  ('70289272',     date '2024-06-24'),
  ('70656323',     date '2024-04-22'),
  ('70699440',     date '2024-03-04'),
  ('72767426',     date '2024-12-23'),
  ('72934740',     date '2023-10-30'),
  ('75477620',     date '2024-08-26'),
  ('75498955',     date '2025-01-27'),
  ('764317796',    date '2024-12-30'),
  ('76507836',     date '2025-04-21'),
  ('766167097',    date '2025-12-29'),
  ('80240096L',    date '2025-09-29'),
  ('80245084Q',    date '2023-10-30'),
  ('B51005928',    date '2026-01-26'),
  ('C5V82CPRP',    date '2024-09-02'),
  ('K2561003Z',    date '2025-09-01'),
  ('P53DA1176',    date '2026-05-25'),
  ('T6967587',     date '2026-02-23')
)
update academic_student_enrollments e
set enrollment_date = f.fecha
from academic_students s, fechas f
where s.document_number = f.doc
  and e.student_id = s.id
  and e.convocatoria_id is null;

-- 2) Match por fecha (idéntico al de las 1954): convocatoria de su categoría con first_day más cercano
with best as (
  select distinct on (e.id) e.id as enr_id, c.id as conv_id
  from academic_student_enrollments e
  join academic_programs p        on p.id = e.program_id
  join convocatoria_categories jc on jc.product_category_id = p.category_id
  join convocatorias c            on c.id = jc.convocatoria_id
  where e.convocatoria_id is null
    and e.enrollment_date is not null
  order by e.id, abs(c.first_day - e.enrollment_date::date)
)
update academic_student_enrollments e
set convocatoria_id = best.conv_id
from best
where e.id = best.enr_id;

commit;

-- Verificación (esperado: vinculadas 1995, sin_vincular 0)
--   select count(*) as total,
--          count(convocatoria_id) as vinculadas,
--          count(*) filter (where convocatoria_id is null) as sin_vincular
--   from academic_student_enrollments;
