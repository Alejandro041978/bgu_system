-- ===========================================================================
-- Un solo vocabulario para la situación del estudiante
--
-- Convivían dos. El motor automático (recomputeSituations) escribe
-- retiro_permanente / retiro_temporal / campus_socio; el selector de la ficha
-- ofrecía IW / LOA / "campus socio". Son las mismas situaciones con distinto
-- nombre, y nada las traducía.
--
-- La consecuencia fue silenciosa y grande: el trámite Re-entry exige
-- situación "IW", un valor que el motor NUNCA produce. Los 349 estudiantes con
-- IW real —los que el sistema marcó solo— no podían pedir su reingreso. Los
-- únicos que sí podían eran los 2 puestos a mano, que además quedan
-- congelados: el motor no recalcula lo que tiene situation_source = 'manual'.
-- ===========================================================================

-- ── 1. El requisito del trámite, en el vocabulario que la base usa ─────────
update tramite_types
   set requires_situation = 'retiro_permanente',
       requires_situation_note = 'El reingreso solo pueden solicitarlo los estudiantes con un retiro permanente (IW) vigente.',
       updated_at = now()
 where name = 'Re-entry';

-- ── 2. Normalizar los valores puestos a mano ──────────────────────────────
-- Se devuelven al motor: si la IW sigue vigente los volverá a marcar igual, y
-- si terminó dejarán de estar retirados solos. Mantenerlos en manual los
-- habría dejado congelados para siempre en un estado que nadie recalcula.
update academic_students
   set situation = 'retiro_permanente', situation_source = 'auto'
 where situation = 'IW';

update academic_students
   set situation = 'retiro_temporal', situation_source = 'auto'
 where situation = 'LOA';

update academic_students
   set situation = 'campus_socio', situation_source = 'auto'
 where situation = 'campus socio';

-- ── 3. Verificación ───────────────────────────────────────────────────────
select coalesce(situation, '(sin situación)') as situacion,
       coalesce(situation_source, 'auto') as origen,
       count(*)::text as estudiantes
  from academic_students group by 1, 2 order by 3 desc;

select name, requires_situation, active from tramite_types order by name;
