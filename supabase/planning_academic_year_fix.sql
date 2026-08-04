-- ===========================================================================
-- PASO 1b · Lo que quedó pendiente del Paso 1
--
-- Los bloques 1 a 3 ya corrieron. Faltan dos cosas:
--   A) archivar el ciclo estratégico duplicado (siguen 2 activos)
--   B) cuadrar los años académicos que cierran antes que su último semestre
-- ===========================================================================


-- ── BLOQUE A · Un solo ciclo estratégico activo ────────────────────────────
-- El bueno es "Strategic Plan" (2023-2028): tiene las 9 dimensiones vivas, los
-- 9 objetivos, 24 acciones, 109 responsables y los 34 KPIs. El otro se creó
-- una semana después y quedó vacío.
--
-- No se borra: se archiva. Un ciclo es la unidad de comparación histórica del
-- plan, y borrar filas de esa tabla es el tipo de limpieza que un año después
-- nadie puede explicar. El guard exige que esté vacío: si alguien le colgó
-- contenido mientras tanto, no hace nada.

update strategic_plan_cycles
   set status = 'superseded',
       name   = name || ' (duplicado vacío — archivado)'
 where id = '673a8c9d-0d13-4ad6-84fd-9393eb18ef63'
   and not exists (select 1 from strategic_dimensions d where d.cycle_id = strategic_plan_cycles.id);


-- ── BLOQUE B · El año termina cuando termina su último semestre ────────────
-- Dos años cierran antes que su propio semestre de verano:
--   AY 2024-2025 cierra el 24/08 y su Summer llega al 31/08  (7 días)
--   AY 2025-2026 cierra el 26/07 y su Summer llega al 23/08  (28 días)
--
-- Con esas fechas, casi un mes del año en curso queda fuera de todo cálculo
-- anual —retención, graduación, recaudación— sin que nadie lo note: no da
-- error, simplemente cuenta de menos.
--
-- Manda el semestre, no el año: las fechas de semestre gobiernan matrículas,
-- ofertas y notas, así que son las que están respaldadas por hechos.

update academic_years y
   set end_date = s.ultimo
  from (select academic_year_id, max(end_date) as ultimo
          from academic_semesters group by academic_year_id) s
 where s.academic_year_id = y.id
   and s.ultimo > y.end_date
   -- Y nunca pisando el arranque del año siguiente.
   and not exists (
     select 1 from academic_years n
      where n.start_date > y.start_date and n.start_date <= s.ultimo);


-- ── BLOQUE C · Verificación ────────────────────────────────────────────────
select 'ciclos estratégicos ACTIVOS (debe ser 1)' as control, count(*)::text as valor
  from strategic_plan_cycles where status = 'active'
union all
select 'dimensiones vigentes del ciclo activo', count(*)::text
  from strategic_dimensions d
  join strategic_plan_cycles c on c.id = d.cycle_id
 where c.status = 'active' and d.status = 'active'
union all
select 'objetivos vigentes (O1-O9)', count(*)::text
  from strategic_objectives where status = 'active'
union all
select 'AÑOS QUE TERMINAN ANTES QUE SU ÚLTIMO SEMESTRE (debe ser 0)', count(*)::text
  from academic_years y
 where exists (select 1 from academic_semesters s
                where s.academic_year_id = y.id and s.end_date > y.end_date)
union all
select 'AÑOS ACADÉMICOS QUE SE PISAN (debe ser 0)', count(*)::text
  from academic_years a join academic_years b
    on a.id <> b.id and a.start_date <= b.end_date and b.start_date <= a.end_date;
