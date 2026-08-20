-- Cuántos matriculados del aula no tienen idnumber en Moodle.
--
-- El puente entre Moodle y el ERP es el idnumber del usuario contra el
-- external_id del estudiante. Vacío, no cruza con nadie: su nota no se importa
-- por bien configurada que esté el aula.
--
-- Hasta ahora ese dato solo se veía abriendo la vista previa de importación de
-- un aula concreta y contando a mano. En el aula 340 (MIS 470) eran 10 de 331,
-- y nadie tenía forma de saberlo sin ir aula por aula (19/08/2026).
--
-- Se llena en la siguiente pasada del Auditor de Campus: sale del mismo
-- core_enrol_get_enrolled_users que ya se pedía para contar matriculados, así
-- que no cuesta una llamada más.
ALTER TABLE moodle_aula_audit
  ADD COLUMN IF NOT EXISTS sin_idnumber integer;

COMMENT ON COLUMN moodle_aula_audit.sin_idnumber IS
  'Matriculados en Moodle con idnumber vacío: no se pueden emparejar con ningún estudiante del ERP.';

-- ¿El informe de usuario de esa aula publica las CALIFICACIONES?
--
-- Es el informe que lee la importación, y se puede apagar por curso en
-- Course grade settings → User report → "Show grades". Apagado, el informe
-- sigue enseñando pesos, rangos y contribuciones pero ni una nota: el servicio
-- web devuelve los ítems sin valor y el ERP concluye que nadie tiene nota.
--
-- El aula 340 llevaba así 331 matrículas sin importar una sola vez. Al
-- encenderlo pasó de 0 a 236 notas (19/08/2026).
ALTER TABLE moodle_aula_audit
  ADD COLUMN IF NOT EXISTS informe_sin_notas boolean;

COMMENT ON COLUMN moodle_aula_audit.informe_sin_notas IS
  'true = el lector expone ponderaciones pero ninguna calificación: el informe de usuario tiene "Show grades" apagado.';
