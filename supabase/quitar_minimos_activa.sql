-- ===========================================================================
-- Quitar los mínimos aprobatorios heredados de SystemActiva
--
-- La nota mínima es una REGLA de la institución —vive en la categoría del
-- programa— y no un dato de la nota. SystemActiva la mandaba pegada a cada
-- fila, y los lectores la preferían sobre la configuración:
--
--   8.953 notas de Bachelor con 75, mientras el ERP declara 70
--   5.058 con 80, 5.458 con 70, y sueltas con 69.99, 69.98, 60, 13
--
-- El resultado eran dos varas dentro de la misma acta según de dónde hubiera
-- llegado cada nota: las de Moodle se medían con la categoría (la importación
-- de Moodle siempre lo hizo bien) y las migradas con la regla de Activa.
--
-- CORRER DESPUÉS del despliegue que invierte la preferencia. Al revés, los
-- lectores que aún caían en un 70 fijo recalcularían Master y Doctorado con la
-- vara de Bachelor.
--
-- No se pierde nada recuperable: el mínimo aplicable se deduce siempre de la
-- categoría del programa, que es donde se configura y se ve.
-- ===========================================================================

update academic_grades set passing_score = null where passing_score is not null;
update academic_grade_details set passing_score = null where passing_score is not null;

select 'notas con mínimo propio (debe ser 0)' as control, count(*)::text as valor
  from academic_grades where passing_score is not null
union all
select 'detalles con mínimo propio (debe ser 0)', count(*)::text
  from academic_grade_details where passing_score is not null
union all
select 'categorías con mínimo configurado', count(*)::text
  from academic_programs_category where passing_score is not null
union all
select 'categorías SIN mínimo (revisar: sus notas quedarían sin regla)', count(*)::text
  from academic_programs_category where passing_score is null;
